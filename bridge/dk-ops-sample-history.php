<?php
/**
 * DK Ops Sample History — a one-off: sends past free-sample orders (and sample-form requests)
 * to ops, so the samples screen can show the long-term conversion rate.
 *
 * Code Snippets: add as a NEW snippet, paste WITHOUT the opening php tag, "Run snippet everywhere".
 * Needs the "DK Ops Feed" snippet to be active (it uses its settings and how it reads orders).
 * Then go to WooCommerce > Sample history, pick the start date and press Send.
 * When it's done you can deactivate this snippet.
 *
 * Only the sample lines are sent: no jobs are made in ops. Customers are matched by email
 * (or created). Sending twice is safe — ops never duplicates a sample.
 */

add_action( 'admin_menu', function () {
	add_submenu_page( 'woocommerce', 'Sample history', 'Sample history', 'manage_woocommerce', 'dk-sample-history', 'dk_sh_page' );
}, 100 );

function dk_sh_send( $payload ) {
	$res = wp_remote_post(
		rtrim( DK_OPS_URL, '/' ) . '/rest/v1/rpc/woo_sample_history',
		array(
			'timeout' => 60,
			'headers' => array(
				'apikey'        => DK_OPS_KEY,
				'Authorization' => 'Bearer ' . DK_OPS_KEY,
				'Content-Type'  => 'application/json',
			),
			'body'    => wp_json_encode( array( 'p_secret' => DK_OPS_SECRET, 'p_payload' => $payload ) ),
		)
	);
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$body = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
		$msg = is_array( $body ) && isset( $body['message'] ) ? $body['message'] : wp_remote_retrieve_body( $res );
		return new WP_Error( 'dk_sh', 'ops said: ' . mb_substr( (string) $msg, 0, 300 ) );
	}
	return is_array( $body ) ? $body : array();
}

// one batch per click-through so it never times out: orders page by page, then the form log
function dk_sh_batch( $from, $page ) {
	$out = array( 'orders' => 0, 'samples' => 0, 'added' => 0, 'done' => false, 'error' => '' );
	if ( $page > 0 ) {
		$orders = wc_get_orders( array(
			'type'         => 'shop_order',
			'status'       => array( 'wc-processing', 'wc-on-hold', 'wc-completed' ),
			'date_created' => '>=' . $from,
			'orderby'      => 'date',
			'order'        => 'ASC',
			'limit'        => 100,
			'paged'        => $page,
		) );
		$payload = array();
		foreach ( $orders as $o ) {
			$p     = dk_ops_order_payload( $o );
			$items = array_values( array_filter( $p['items'], function ( $i ) { return ! empty( $i['isSample'] ); } ) );
			if ( $items ) {
				$p['items'] = $items;
				$payload[]  = $p;
			}
		}
		$out['orders'] = count( $orders );
		if ( $payload ) {
			$r = dk_sh_send( array( 'orders' => $payload ) );
			if ( is_wp_error( $r ) ) {
				$out['error'] = $r->get_error_message();
				return $out;
			}
			$out['samples'] = count( $payload );
			$out['added']   = isset( $r['added'] ) ? (int) $r['added'] : 0;
		}
		return $out;
	}
	// page 0: the /sample-request/ form log
	global $wpdb;
	$t = $wpdb->prefix . 'dk_sample_requests';
	if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $t ) ) === $t ) {
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t WHERE created_at >= %s ORDER BY id ASC LIMIT 2000", $from . ' 00:00:00' ), ARRAY_A );
		foreach ( array_chunk( $rows, 100 ) as $chunk ) {
			$reqs = array();
			foreach ( $chunk as $r ) {
				$reqs[] = array(
					'srId'     => (string) $r['id'],
					'date'     => substr( (string) $r['created_at'], 0, 10 ),
					'first'    => $r['first_name'],
					'last'     => $r['last_name'],
					'email'    => $r['email'],
					'phone'    => $r['phone'],
					'house'    => $r['house'],
					'street'   => $r['street'],
					'town'     => $r['town'],
					'postcode' => $r['postcode'],
					'samples'  => array_values( array_filter( array_map( 'trim', explode( "\n", (string) $r['samples'] ) ) ) ),
					'notes'    => $r['notes'],
				);
			}
			$res = dk_sh_send( array( 'sampleRequests' => $reqs ) );
			if ( is_wp_error( $res ) ) {
				$out['error'] = $res->get_error_message();
				return $out;
			}
			$out['samples'] += count( $reqs );
			$out['added']   += isset( $res['added'] ) ? (int) $res['added'] : 0;
		}
	}
	return $out;
}

function dk_sh_page() {
	echo '<div class="wrap"><h1>Sample history → ops</h1>';
	if ( ! function_exists( 'dk_ops_order_payload' ) || ! defined( 'DK_OPS_SECRET' ) ) {
		echo '<div class="notice notice-error"><p>The <b>DK Ops Feed</b> snippet needs to be active first.</p></div></div>';
		return;
	}
	$from = isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : '';
	if ( $from && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $from ) && isset( $_GET['_wpnonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'dk_sh' ) ) {
		@set_time_limit( 120 );
		$page  = isset( $_GET['pg'] ) ? (int) $_GET['pg'] : 0;
		$tot   = isset( $_GET['tot'] ) ? json_decode( base64_decode( sanitize_text_field( wp_unslash( $_GET['tot'] ) ) ), true ) : array();
		$tot   = is_array( $tot ) ? $tot : array( 'orders' => 0, 'samples' => 0, 'added' => 0 );
		$r     = dk_sh_batch( $from, $page );
		foreach ( array( 'orders', 'samples', 'added' ) as $k ) {
			$tot[ $k ] = ( isset( $tot[ $k ] ) ? (int) $tot[ $k ] : 0 ) + $r[ $k ];
		}
		$summary = 'Orders checked: <b>' . (int) $tot['orders'] . '</b> · samples sent: <b>' . (int) $tot['samples'] . '</b> · new in ops: <b>' . (int) $tot['added'] . '</b>';
		if ( $r['error'] ) {
			echo '<div class="notice notice-error"><p><b>Stopped:</b> ' . esc_html( $r['error'] ) . '</p><p>' . $summary . '</p><p>Press Send again to carry on — nothing is duplicated.</p></div>';
		} elseif ( $page > 0 && $r['orders'] < 100 ) {
			echo '<div class="notice notice-success"><p><b>All done.</b> ' . $summary . '</p><p>You can deactivate this snippet now.</p></div>';
		} else {
			$next = add_query_arg( array( 'page' => 'dk-sample-history', 'from' => $from, 'pg' => $page + 1, 'tot' => base64_encode( wp_json_encode( $tot ) ), '_wpnonce' => wp_create_nonce( 'dk_sh' ) ), admin_url( 'admin.php' ) );
			echo '<div class="notice notice-info"><p>Working… ' . $summary . ' — leave this page open.</p></div>';
			echo '<script>setTimeout(function(){location.href=' . wp_json_encode( $next ) . ';},300);</script>';
		}
	}
	$def = wp_date( 'Y-m-d', strtotime( '-9 months' ) );
	echo '<p>Sends every free-sample order (and /sample-request/ form request) since the date below to ops. Only the samples go across — no jobs are made, so FileMaker\'s jobs aren\'t touched.</p>';
	echo '<form method="get" action="' . esc_url( admin_url( 'admin.php' ) ) . '">';
	echo '<input type="hidden" name="page" value="dk-sample-history"><input type="hidden" name="pg" value="0">';
	echo '<input type="hidden" name="_wpnonce" value="' . esc_attr( wp_create_nonce( 'dk_sh' ) ) . '">';
	echo 'Samples since <input type="date" name="from" value="' . esc_attr( $from ? $from : $def ) . '"> <button class="button button-primary">Send</button></form></div>';
}
