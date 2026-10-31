<?php
/**
 * DK Ops Feed — sends website orders and sample requests to the ops system (ops.deckkingdom.co.uk)
 *
 * Code Snippets: paste WITHOUT the opening php tag, "Run snippet everywhere".
 *
 * What it does, every 5 minutes (and shortly after any order is placed or changes status):
 *   1. New and changed WooCommerce orders go to ops:
 *        - products on the order  -> an invoice in ops (order ref WEB-12345, no invoice number yet)
 *        - free sample products    -> a sample request in ops (source "Website order")
 *   2. New entries from the /sample-request/ form (the "DK Sample Requests" snippet's log)
 *      -> a sample request in ops (source "Sample request form").
 *      Any WPForms form with "sample" in its title is picked up too, while that's still in use.
 *   3. Customers are matched in ops by email address, or created.
 *
 * Nothing on the website changes for customers. If ops can't be reached, it simply tries
 * again next time — nothing is lost. Status page: WooCommerce > Ops feed.
 */

if ( ! defined( 'DK_OPS_URL' ) ) {
	define( 'DK_OPS_URL', 'https://wttgznlukleiunczaqoh.supabase.co' );
}
if ( ! defined( 'DK_OPS_KEY' ) ) {
	define( 'DK_OPS_KEY', 'sb_publishable_8lBS1gL2zMxM7bHj2mlHbA_y-RbcsuD' );
}
if ( ! defined( 'DK_OPS_SECRET' ) ) {
	define( 'DK_OPS_SECRET', 'PASTE-SECRET-HERE' );
}
if ( ! defined( 'DK_OPS_START' ) ) {
	define( 'DK_OPS_START', '2026-10-31' ); // first run sends orders changed on/after this date
}

/* ---------- which order lines are free samples ---------- */
function dk_ops_is_sample( $product, $name ) {
	if ( $product ) {
		$pid = $product->get_parent_id() ? $product->get_parent_id() : $product->get_id();
		$cats = wp_get_post_terms( $pid, 'product_cat', array( 'fields' => 'slugs' ) );
		if ( ! is_wp_error( $cats ) ) {
			foreach ( $cats as $slug ) {
				if ( false !== strpos( $slug, 'sample' ) ) {
					return true;
				}
			}
		}
	}
	return (bool) preg_match( '/\bsamples?\b/i', (string) $name );
}

/* ---------- colour of an order line: variation attribute, else from the title ---------- */
function dk_ops_colour( $item, $product ) {
	foreach ( array( 'pa_colour', 'colour', 'pa_color', 'color', 'Colour' ) as $k ) {
		$v = $item->get_meta( $k, true );
		if ( $v ) {
			$term = taxonomy_exists( $k ) ? get_term_by( 'slug', $v, $k ) : false;
			return $term ? $term->name : (string) $v;
		}
	}
	if ( $product ) {
		$v = $product->get_attribute( 'pa_colour' );
		if ( $v && false === strpos( $v, ',' ) ) {
			return $v;
		}
	}
	$known = array( 'Ash White', 'Red/Brown', 'Red Brown', 'Golden Teak', 'Golden Oak', 'Anthracite', 'Chocolate', 'Charcoal', 'Walnut', 'Silver', 'Maple', 'Antique', 'Black', 'Grey', 'Teak', 'Oak', 'Galvanised', 'Slate' );
	foreach ( $known as $c ) {
		if ( false !== stripos( (string) $item->get_name(), $c ) ) {
			return $c;
		}
	}
	return '';
}

/* ---------- one order as ops wants it ---------- */
function dk_ops_order_payload( $order ) {
	$addr = function ( $type ) use ( $order ) {
		$g = function ( $f ) use ( $order, $type ) {
			$m = 'get_' . $type . '_' . $f;
			return method_exists( $order, $m ) ? (string) $order->$m() : '';
		};
		return array(
			'first'    => $g( 'first_name' ),
			'last'     => $g( 'last_name' ),
			'company'  => $g( 'company' ),
			'email'    => 'billing' === $type ? (string) $order->get_billing_email() : '',
			'phone'    => 'billing' === $type ? (string) $order->get_billing_phone() : $g( 'phone' ),
			'address1' => $g( 'address_1' ),
			'address2' => $g( 'address_2' ),
			'city'     => $g( 'city' ),
			'postcode' => $g( 'postcode' ),
		);
	};
	$items = array();
	foreach ( $order->get_items() as $item ) {
		$product = $item->get_product();
		$qty     = (float) $item->get_quantity();
		$total   = (float) $item->get_total() + (float) $item->get_total_tax();
		$items[] = array(
			'sku'      => $product ? (string) $product->get_sku() : '',
			'name'     => (string) $item->get_name(),
			'colour'   => dk_ops_colour( $item, $product ),
			'qty'      => $qty,
			'price'    => $qty ? round( $total / $qty, 2 ) : 0, // per piece, inc VAT, after any discount
			'isSample' => dk_ops_is_sample( $product, $item->get_name() ),
		);
	}
	$created = $order->get_date_created();
	$paid    = $order->get_date_paid();
	return array(
		'wooId'          => (string) $order->get_id(),
		'number'         => (string) $order->get_order_number(),
		'status'         => (string) $order->get_status(),
		'date'           => $created ? $created->date( 'Y-m-d' ) : '',
		'datePaid'       => $paid ? $paid->date( 'Y-m-d' ) : '',
		'paymentMethod'  => (string) $order->get_payment_method_title(),
		'shippingTotal'  => round( (float) $order->get_shipping_total() + (float) $order->get_shipping_tax(), 2 ),
		'shippingMethod' => (string) $order->get_shipping_method(),
		'customerNote'   => (string) $order->get_customer_note(),
		'billing'        => $addr( 'billing' ),
		'shipping'       => $addr( 'shipping' ),
		'items'          => $items,
	);
}

/* ---------- send to ops ---------- */
function dk_ops_send( $payload ) {
	$res = wp_remote_post(
		rtrim( DK_OPS_URL, '/' ) . '/rest/v1/rpc/woo_sync',
		array(
			'timeout' => 30,
			'headers' => array(
				'apikey'        => DK_OPS_KEY,
				'Authorization' => 'Bearer ' . DK_OPS_KEY,
				'Content-Type'  => 'application/json',
			),
			'body'    => wp_json_encode( array( 'p_secret' => DK_OPS_SECRET, 'p_payload' => $payload ) ),
		)
	);
	if ( is_wp_error( $res ) ) {
		return new WP_Error( 'dk_ops', $res->get_error_message() );
	}
	$code = (int) wp_remote_retrieve_response_code( $res );
	$body = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( 200 !== $code ) {
		$msg = is_array( $body ) && isset( $body['message'] ) ? $body['message'] : wp_remote_retrieve_body( $res );
		return new WP_Error( 'dk_ops', 'ops said ' . $code . ': ' . mb_substr( (string) $msg, 0, 300 ) );
	}
	return is_array( $body ) ? $body : array();
}

/* ---------- the run ---------- */
function dk_ops_run( $force_since = '' ) {
	if ( get_transient( 'dk_ops_lock' ) ) {
		return;
	}
	set_transient( 'dk_ops_lock', 1, 120 );
	$st = get_option( 'dk_ops_state', array() );
	$st = is_array( $st ) ? $st : array();
	$log = array( 'at' => current_time( 'mysql' ), 'orders' => 0, 'requests' => 0, 'error' => '' );

	try {
		// 1. orders changed since last time (by modified date, oldest first, 50 at a time)
		if ( function_exists( 'wc_get_orders' ) ) {
			$since = $force_since ? strtotime( $force_since ) : ( isset( $st['orders_since'] ) ? (int) $st['orders_since'] : strtotime( DK_OPS_START ) );
			for ( $round = 0; $round < 10; $round++ ) {
				$orders = wc_get_orders( array(
					'type'          => 'shop_order',
					'status'        => array( 'wc-processing', 'wc-on-hold', 'wc-completed', 'wc-cancelled', 'wc-refunded' ),
					'date_modified' => '>' . $since,
					'orderby'       => 'modified',
					'order'         => 'ASC',
					'limit'         => 50,
				) );
				if ( ! $orders ) {
					break;
				}
				$payload = array();
				$latest  = $since;
				foreach ( $orders as $o ) {
					$payload[] = dk_ops_order_payload( $o );
					$m = $o->get_date_modified();
					if ( $m && $m->getTimestamp() > $latest ) {
						$latest = $m->getTimestamp();
					}
				}
				$r = dk_ops_send( array( 'orders' => $payload ) );
				if ( is_wp_error( $r ) ) {
					throw new Exception( $r->get_error_message() );
				}
				$log['orders'] += count( $payload );
				$since = $latest;
				$st['orders_since'] = $since;
				update_option( 'dk_ops_state', $st, false );
				if ( count( $orders ) < 50 ) {
					break;
				}
			}
		}

		// 2. sample request form entries (the DK Sample Requests log table)
		global $wpdb;
		$t = $wpdb->prefix . 'dk_sample_requests';
		if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $t ) ) === $t ) {
			$last = isset( $st['sr_last_id'] ) ? (int) $st['sr_last_id'] : -1;
			if ( $last < 0 ) { // first run: from the start date
				$last = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(MAX(id),0) FROM $t WHERE created_at < %s", DK_OPS_START . ' 00:00:00' ) );
			}
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t WHERE id > %d ORDER BY id ASC LIMIT 100", $last ), ARRAY_A );
			if ( $rows ) {
				$reqs = array();
				foreach ( $rows as $r ) {
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
				$res = dk_ops_send( array( 'sampleRequests' => $reqs ) );
				if ( is_wp_error( $res ) ) {
					throw new Exception( $res->get_error_message() );
				}
				$log['requests'] += count( $reqs );
				$st['sr_last_id'] = (int) end( $rows )['id'];
			} else {
				$st['sr_last_id'] = $last;
			}
		}

		// 3. WPForms sample requests caught by the hook below, waiting to go
		$queue = get_option( 'dk_ops_wpf_queue', array() );
		if ( is_array( $queue ) && $queue ) {
			$res = dk_ops_send( array( 'sampleRequests' => array_values( $queue ) ) );
			if ( is_wp_error( $res ) ) {
				throw new Exception( $res->get_error_message() );
			}
			$log['requests'] += count( $queue );
			update_option( 'dk_ops_wpf_queue', array(), false );
		}
	} catch ( Exception $e ) {
		$log['error'] = $e->getMessage();
	}

	update_option( 'dk_ops_state', $st, false );
	$hist = get_option( 'dk_ops_log', array() );
	$hist = is_array( $hist ) ? $hist : array();
	if ( $log['orders'] || $log['requests'] || $log['error'] ) {
		array_unshift( $hist, $log );
		update_option( 'dk_ops_log', array_slice( $hist, 0, 30 ), false );
	}
	update_option( 'dk_ops_last', $log, false );
	delete_transient( 'dk_ops_lock' );
}

/* ---------- schedule: every 5 minutes, and soon after any order activity ---------- */
add_filter( 'cron_schedules', function ( $s ) {
	$s['dk_ops_5min'] = array( 'interval' => 300, 'display' => 'Every 5 minutes (DK ops feed)' );
	return $s;
} );
add_action( 'dk_ops_feed_run', 'dk_ops_run' );
add_action( 'init', function () {
	if ( ! wp_next_scheduled( 'dk_ops_feed_run' ) ) {
		wp_schedule_event( time() + 60, 'dk_ops_5min', 'dk_ops_feed_run' );
	}
} );
function dk_ops_soon() {
	if ( ! wp_next_scheduled( 'dk_ops_feed_soon' ) ) {
		wp_schedule_single_event( time() + 20, 'dk_ops_feed_soon' );
	}
}
add_action( 'dk_ops_feed_soon', 'dk_ops_run' );
add_action( 'woocommerce_new_order', 'dk_ops_soon' );
add_action( 'woocommerce_order_status_changed', 'dk_ops_soon' );

/* ---------- WPForms sample forms (while still in use) ---------- */
add_action( 'wpforms_process_complete', function ( $fields, $entry, $form_data, $entry_id ) {
	$title = isset( $form_data['settings']['form_title'] ) ? $form_data['settings']['form_title'] : '';
	if ( false === stripos( $title, 'sample' ) ) {
		return;
	}
	$r = array( 'srId' => 'wpf' . ( $entry_id ? $entry_id : wp_generate_password( 8, false ) ), 'date' => current_time( 'Y-m-d' ),
		'first' => '', 'last' => '', 'email' => '', 'phone' => '', 'house' => '', 'street' => '', 'town' => '', 'postcode' => '', 'samples' => array(), 'notes' => '' );
	foreach ( (array) $fields as $f ) {
		$label = strtolower( isset( $f['name'] ) ? $f['name'] : '' );
		$type  = isset( $f['type'] ) ? $f['type'] : '';
		$val   = isset( $f['value'] ) ? trim( (string) $f['value'] ) : '';
		if ( 'name' === $type ) {
			$r['first'] = isset( $f['first'] ) ? $f['first'] : $val;
			$r['last']  = isset( $f['last'] ) ? $f['last'] : '';
		} elseif ( 'email' === $type ) {
			$r['email'] = $val;
		} elseif ( 'phone' === $type || false !== strpos( $label, 'phone' ) ) {
			$r['phone'] = $val;
		} elseif ( 'address' === $type ) {
			$r['street']   = trim( ( isset( $f['address1'] ) ? $f['address1'] : '' ) . ' ' . ( isset( $f['address2'] ) ? $f['address2'] : '' ) );
			$r['town']     = isset( $f['city'] ) ? $f['city'] : '';
			$r['postcode'] = isset( $f['postal'] ) ? $f['postal'] : '';
		} elseif ( false !== strpos( $label, 'postcode' ) || false !== strpos( $label, 'post code' ) ) {
			$r['postcode'] = $val;
		} elseif ( in_array( $type, array( 'checkbox', 'select', 'radio' ), true ) && $val !== '' ) {
			foreach ( preg_split( '/\r?\n/', $val ) as $choice ) {
				if ( trim( $choice ) !== '' ) {
					$r['samples'][] = trim( $f['name'] ) . ' — ' . trim( $choice );
				}
			}
		} elseif ( 'textarea' === $type ) {
			$r['notes'] = $val;
		}
	}
	$q = get_option( 'dk_ops_wpf_queue', array() );
	$q = is_array( $q ) ? $q : array();
	$q[ $r['srId'] ] = $r;
	update_option( 'dk_ops_wpf_queue', $q, false );
	if ( ! wp_next_scheduled( 'dk_ops_feed_soon' ) ) {
		wp_schedule_single_event( time() + 20, 'dk_ops_feed_soon' );
	}
}, 10, 4 );

/* ---------- status page: WooCommerce > Ops feed ---------- */
add_action( 'admin_menu', function () {
	add_submenu_page( 'woocommerce', 'Ops feed', 'Ops feed', 'manage_woocommerce', 'dk-ops-feed', 'dk_ops_admin_page' );
}, 99 );
add_action( 'admin_post_dk_ops_now', function () {
	if ( ! current_user_can( 'manage_woocommerce' ) || ! check_admin_referer( 'dk_ops_now' ) ) {
		wp_die( 'Not allowed' );
	}
	$from = isset( $_POST['from'] ) ? sanitize_text_field( wp_unslash( $_POST['from'] ) ) : '';
	delete_transient( 'dk_ops_lock' );
	dk_ops_run( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $from ) ? $from : '' );
	wp_safe_redirect( admin_url( 'admin.php?page=dk-ops-feed&done=1' ) );
	exit;
} );
function dk_ops_admin_page() {
	$last = get_option( 'dk_ops_last', array() );
	$st   = get_option( 'dk_ops_state', array() );
	$hist = get_option( 'dk_ops_log', array() );
	$next = wp_next_scheduled( 'dk_ops_feed_run' );
	echo '<div class="wrap"><h1>Ops feed</h1>';
	echo '<p>Website orders and sample requests are sent to <b>ops.deckkingdom.co.uk</b> every 5 minutes, and shortly after any order comes in or changes.</p>';
	if ( 'PASTE-SECRET-HERE' === DK_OPS_SECRET ) {
		echo '<div class="notice notice-error"><p>The secret hasn\'t been pasted into the snippet yet, so nothing can be sent.</p></div>';
	}
	if ( ! empty( $last['error'] ) ) {
		echo '<div class="notice notice-error"><p><b>Last try failed:</b> ' . esc_html( $last['error'] ) . ' — it will try again automatically.</p></div>';
	} elseif ( ! empty( $last['at'] ) ) {
		echo '<div class="notice notice-success"><p>Last run ' . esc_html( $last['at'] ) . ' — all good.</p></div>';
	}
	echo '<table class="widefat striped" style="max-width:720px"><tbody>';
	echo '<tr><td>Orders sent up to (last changed)</td><td>' . ( isset( $st['orders_since'] ) ? esc_html( wp_date( 'j M Y H:i', (int) $st['orders_since'] ) ) : 'not yet' ) . '</td></tr>';
	echo '<tr><td>Sample requests sent up to</td><td>' . ( isset( $st['sr_last_id'] ) ? 'request #' . (int) $st['sr_last_id'] : 'not yet' ) . '</td></tr>';
	echo '<tr><td>Next automatic run</td><td>' . ( $next ? esc_html( wp_date( 'j M Y H:i', $next ) ) : 'being scheduled' ) . '</td></tr>';
	echo '</tbody></table>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin:16px 0">';
	wp_nonce_field( 'dk_ops_now' );
	echo '<input type="hidden" name="action" value="dk_ops_now"><button class="button button-primary">Send now</button> ';
	echo '&nbsp; or resend orders changed since <input type="date" name="from"> <button class="button">Resend</button>';
	echo ' <span class="description">Resending is safe — ops updates what it has, it never duplicates.</span></form>';
	if ( $hist ) {
		echo '<h2>Recent activity</h2><table class="widefat striped" style="max-width:720px"><thead><tr><th>When</th><th>Orders</th><th>Sample requests</th><th>Problem</th></tr></thead><tbody>';
		foreach ( $hist as $h ) {
			echo '<tr><td>' . esc_html( $h['at'] ) . '</td><td>' . (int) $h['orders'] . '</td><td>' . (int) $h['requests'] . '</td><td>' . esc_html( $h['error'] ) . '</td></tr>';
		}
		echo '</tbody></table>';
	}
	echo '</div>';
}
