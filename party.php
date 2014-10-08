<?php
/*
Script to interact with event/party request page. Currently two functions:

* build the config file into a data structure that allows intelligence about times/dates
* receive the reservation request

--Chris Braiotta, March 2014
--updated July 2014
*/

date_default_timezone_set('US/Eastern');

$DATE_FORMAT = 'm/d/Y';
$DATE_FORMAT = 'M d Y';

$CONF_PATH = './conf/config.txt';
$ERRORS_FATAL = true;
$ERRORS = array();
$LINE_NOS = array();
$SUBJ = 'Royal Palms Party Request';
$TIME_SLOT_INCREMENT = 30;
$TO_ADDR = 'events@royalpalmsshuffle.com';



//handle the function
switch ($_POST['function']) {
	case 'getConfigs':
		ajax_getConfigs();
		break;

	case 'loadPartyConfig':
		ajax_loadPartyConfig(false);
		break;
		
	case 'submitReservation':
		ajax_submitReservation($_POST['form_json']);
		break;
	
	case 'testConfig':
		ajax_testConfig($_POST['config_name']);
		break;
	
	default:
		handleError('no function defined for ' . $_POST['function']);
		break;
}

function ajax_getConfigs() {
	global $CONF_PATH;
	$path = $CONF_PATH;
	$path = preg_replace('/config\.txt$/', '', $path);
	$files = scandir($path);
	$real_files = array();
	foreach ($files as $file) {
		if (!preg_match('/^\.+$/', $file)) {
			$real_files[] = urlencode($file);
		}
	}
	print json_encode($real_files);
}

function ajax_loadPartyConfig($path) {
	global $CONF_PATH;
	if (!$path) {
		$path = $CONF_PATH;
	}

	$raw_conf = ajax_loadPartyConfig__fromFile($path);
	$config = parsePartyConfig($raw_conf);
	
	//the ajax sub only gets called from javascript; javascript doesn't need to know about
	//the confirmation email. that's a possible point for JSON to fail, so we leave it out.
	unset($config['confirmation_email_body']);
	unset($config['confirmation_email_from']);
	unset($config['confirmation_email_subj']);
	unset($config['confirmation_email_send']);
	
	print json_encode($config);
}

function ajax_loadPartyConfig__fromFile($path) {
	$text = file($path);
	return $text;
}


function ajax_submitReservation($json) {
	global $TO_ADDR;
	global $SUBJ;

	$json = $_POST['form_json'];
	$form = json_decode($json, true);

	$form = formdata_sanitize($form);
	$errors = formdata_validate($form);
	if (count($errors)) {
		$msg = "Sorry! You need to fix these problems to reserve a party:_NEWLINE__NEWLINE_";
		$msg .= '* ' . join("_NEWLINE_* ", $errors);
		handleError($msg);
	}

	$subject = ajax_submitReservation_deriveSubject($form, $form['date']);
	
	sendReservation($form, $TO_ADDR, $subject);
	
	global $CONF_PATH;
	$raw_conf = ajax_loadPartyConfig__fromFile($CONF_PATH);
	$config = parsePartyConfig($raw_conf);
	if ($config['confirmation_email_send']) {
		sendConfirmation($form, $config);
	}
}


function ajax_submitReservation_deriveSubject($form, $date) {
	global $SUBJ;
	$subject = $SUBJ;
	
	if (preg_match('/_premium$/', $form['beverage_package'])) {
		$subject .= ' - PREMIUM';
	}
	
	$subject .= ' (' . $date . ')';
	
	return $subject;
}


function ajax_testConfig($config_name) {
	global $CONF_PATH;
	$path = $CONF_PATH;
	$path = preg_replace('/config\.txt$/', '', $path);
	
	global $ERRORS_FATAL;
	$ERRORS_FATAL = false;
	
	$config_name = makeJSUnsafe($config_name);
	
	$raw_conf = ajax_loadPartyConfig__fromFile($path . $config_name);
	$config = parsePartyConfig($raw_conf);
	
	global $ERRORS;
	$return = array();
	$return['errors'] = $ERRORS;
	$return['config_name'] = $config_name;
	$return['config'] = $config;
	
	print json_encode($return);
}

function buildLineNoLookup($raw_conf) {
	global $LINE_NOS;
	
	$line_no = 1;
	foreach ($raw_conf as $line) {
		$clean_line = preg_replace('/\s+/', ' ', rtrim(ltrim($line)));
		$LINE_NOS["$clean_line"][] = $line_no;
		++$line_no;
	}
}

function buildTimeRange($start, $end, $inc) {
	$times = array();
	
	//need to make 'p' into 'pm' for strtotime()
	if (preg_match('/[a|p]$/', $start)) {
		$start .= 'm';
	}
	if (preg_match('/[a|p]$/', $end)) {
		$end .= 'm';
	}
	
	$start_time = strtotime($start);
	$this_time = $start_time;
	$end_time = strtotime($end);
	
	while ($this_time <= $end_time) {
		$times[] = preg_replace('/m$/', '', date('g:ia', $this_time));
	
		$this_time += $inc * 60;
	}
	
	return $times;
}

function expandDateObjects($dates) {
	$new_dates = array();
	
	foreach ($dates as $k => $v) {
		$k_array = preg_split('/\s*,\s*/', $k);
		foreach ($k_array as $this_k) {
			$this_k = expandDateObjects_convertDate($this_k);
			$new_dates["$this_k"] = $v;
		}
	}
	
	return $new_dates;
}

//convert all dates to something like 'jul 21 2014'. leave weekdays alone.
function expandDateObjects_convertDate($date) {
	if (preg_match('/^[a-z|A-Z]+$/', $date)) {
		return $date;
	}
	
	$date = strtolower(date('M d Y', strtotime($date)));
	
	return $date;
}

function formdata_sanitize($form) {
	foreach ($form as $k => $v) {
		if ($k == 'email') {
			$filtered_email = filter_var($v, FILTER_SANITIZE_EMAIL);
		
			if (!$filtered_email) {
				return ('Please provide a real email address.');
			}
		
			$form["$k"] = $filtered_email;
		}
	
		else {
			$form["$k"] = filter_var($v, FILTER_SANITIZE_STRING);
		}
	}

	return $form;
}

function formdata_validate($form) {
	$errors = array();
	
	//is there a name
	if (!preg_match('/.+ .+/', $form['name']) || !preg_match('/[a-z|A-Z]/', $form['name'])) {
		$errors[] = 'Please provide a first and last name.';
	}
	
	//is there a good email addr (don't actually care how exact this is;
	//basically want to know if it looks SOMETHING like an email address.
	if (!preg_match('/^.+\@.+\..+$/', $form['email'])) {
		$errors[] = 'Please provide a real email address.';
	}
	
	//is there a good phone number (only care that it has 10+ digits)
	$phone = $form['phone'];
	$phone = preg_replace('/\D/', '', $phone);
	if (strlen($phone) < 10) {
		$errors[] = 'Please provide a real phone number.';
	}
	
	//is there a date (comes from the datepicker, so has predictable format)
	if (!preg_match('/^\d{1,2}\/\d{1,2}\/\d{4}$/', $form['date'])) {
		$errors[] = 'Please pick a valid date.';
	}
	
	//check date is the future
	$date = $form['date'];
	$raw_date = strtotime($date);
	$now = time();
	if ($raw_date < $now) {
		$errors[] = 'The date you choose has to be in the future.';
	}
	
	//is there a # of guests
	if (strlen($form['guests']) < 1) {
		$errors[] = 'Please say how many guests are coming.';
	}
	
	//if # of guests is provided, must be a number >= 10.
	if (!preg_match('/^\d+$/', $form['guests']) || $form['guests'] < 10) {
		$errors[] = 'The number of guests has to be a number 10 or greater.';
	}
	
	//is there a bev package
	if (!$form['beverage_package'] || strlen($form['beverage_package']) < 1) {
		$errors[] = 'Please select a beverage package.';
	}
	
	return $errors;
}

function freezeForJson(&$line, $key) {
	$line = urlencode($line);
}

function handleError($msg, $line_str = false) {
	global $ERRORS_FATAL;
	global $ERRORS;
	
	if ($ERRORS_FATAL === true) {
		print 'ERROR::' . $msg;
		exit;
	}
	
	if ($line_str)  {
		global $LINE_NOS;
		
		$clean_line = preg_replace('/\s+/', ' ', ltrim(rtrim($line_str)));
		$this_line_nos = $LINE_NOS["$clean_line"];
		if (count($this_line_nos) > 0) {
			$msg_line_no = ' (line';
			if (count($this_line_nos) > 1) {
				$msg_line_no .= 's';
			}
			$msg_line_no .= ' ' . join(', ', $this_line_nos) . ')';
		}
		
		$msg .=  $msg_line_no;
	}
	
	$ERRORS[] = $msg;
}

function makeJSUnsafe($str) {
	$str = preg_replace('/__PERCENT__/', '%', $str);
	$str = urldecode(urldecode($str));
	$str = preg_replace('/__DOT__/', '.', $str);
	$str = preg_replace('/__PLUS__/', '+', $str);
	
	return $str;
}

function parsePartyConfig($raw_conf) {
	buildLineNoLookup($raw_conf);
	
	$stanzas = parsePartyConfig_buildStanzas($raw_conf);
	$conf = parsePartyConfig_parseStanzas($stanzas);

	#escape out the confirmation email
#	array_walk($conf['confirmation_email_body'], 'freezeForJson');
	
	return $conf;
}

function parsePartyConfig_buildStanzas($raw_conf) {
	$stanzas = array();
	$this_stanza_name = false;
	$this_stanza = array();
	foreach ($raw_conf as $line) {
		$line = rtrim($line);

		//ignore comments and blank lines
		if (skippable($line)) {
			continue;
		}
		
		//new stanza begins
		if (preg_match('/^\s*\!/', $line)) {

			//have a previous stanza? save it.
			if (count($this_stanza) > 0) {
				if (isset($stanzas["$this_stanza_name"])) {
					handleError("error in the config file: '" . $this_stanza_name . "' defined more than once", $line);
				}
			
				$stanzas["$this_stanza_name"] = $this_stanza;
			}
			
			//initialize the new stanza
			$this_stanza_name = preg_replace('/^\!/', '', $line);
			$this_stanza = array();
		}
		
		//otherwise, if a stanza is defined, throw it on the pile, after
		//normalizing whitespace
		else if ($this_stanza_name) {
			$line = preg_replace('/\s+/', ' ', preg_replace('/^\s+/', '', $line));
		
			$this_stanza[] = $line;
		}
	}

	//finally, grab that last stanza
	if (isset($stanzas["$this_stanza_name"])) {
		handleError("error in the config file: '" . $this_stanza_name . "' defined more than once", $line);
	}

	$stanzas["$this_stanza_name"] = $this_stanza;

	return $stanzas;
}

function parsePartyConfig_parseStanzas($stanzas) {
	$conf = array();
	
	foreach ($stanzas as $s_key => $s_lines) {
		switch ($s_key) {
			case 'big party':
				$conf = parsePartyConfig_parseStanzas__partyType($s_lines, 'big regular', $conf);
				break;

			case 'big premium party':
				$conf = parsePartyConfig_parseStanzas__partyType($s_lines, 'big premium', $conf);
				break;

			case 'blacklist dates':
				$conf = parsePartyConfig_parseStanzas__blacklist($s_lines, $conf);
				break;
		
			case 'confirmation email body':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'confirmation_email_body', $conf);
				break;
			
			case 'confirmation email from address':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'confirmation_email_from', $conf);
				$conf['confirmation_email_from'] = join(',', $conf['confirmation_email_from']);
				break;
			
			case 'confirmation email subject':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'confirmation_email_subj', $conf);
				$conf['confirmation_email_subj'] = join("\n", $conf['confirmation_email_subj']);
				break;
			
			case 'confirmation popup':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'confirmation_popup', $conf);
				$conf['confirmation_popup'] = urlencode(join("\n", $conf['confirmation_popup']));
				break;
		
			case 'how many days in advance can you book':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'horizon', $conf, 'single');
				break;
		
			case 'how many people is a big party':
				$conf = parsePartyConfig_parseStanzas__getNumber($s_lines, 'big', $s_key, $conf);
				break;
			
			case 'how many people is too many':
				$conf = parsePartyConfig_parseStanzas__getNumber($s_lines, 'malthusian', $s_key, $conf);
				break;
			
			case 'league night message':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'league_msg', $conf);
				break;
			
			case 'league nights':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'league', $conf);
				if (count($conf['league']) == 1) {
					$conf['league'] = preg_split('/,\s*/', $conf['league'][0]);
				}
				break;
			
			case 'message for too many people':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'malthus_msg', $conf);
				$conf['malthus_msg'] = join("\n", $conf['malthus_msg']);
				break;
			
			case 'premium party':
				$conf = parsePartyConfig_parseStanzas__partyType($s_lines, 'premium', $conf);
				break;
				
			case 'regular party':
				$conf = parsePartyConfig_parseStanzas__partyType($s_lines, 'regular', $conf);
				break;
				
			case 'send confirmation email':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'confirmation_email_send', $conf);
				$bool_val = true;
				if (strtolower(join('', $conf['confirmation_email_send'])) == 'no') {
					$bool_val = false;
				}
				$conf['confirmation_email_send'] = $bool_val;
				break;
			
			case 'standard unavailable message':
				$conf = parsePartyConfig_parseStanzas__simple($s_lines, 'std_msg', $conf);
				break;
			
			case 'whitelist datetimes':
				$conf = parsePartyConfig_parseStanzas__whitelist($s_lines, $conf);
				break;
				
			default:
				handleError("no action defined for conf variable '" . $s_key . "'", '!' . $s_key);
				break;
		}
	}
	
	return $conf;
}

function parsePartyConfig_parseStanzas__blacklist($s_lines, $conf) {
	global $DATE_FORMAT;

	$dates = array();
	
	foreach ($s_lines as $line) {
		$line_stamp = strtotime($line);
		if ($line_stamp === false) {
			handleError('blacklist date ' . $line . ' does not look like a date', $line);
		}
		
		else {
			$dates[] = strtolower(date($DATE_FORMAT, $line_stamp));
		}
	}

	$conf['blacklist'] = $dates;
	
	return $conf;
}

function parsePartyConfig_parseStanzas__getNumber($s_lines, $type, $key, $conf) {
	//should only be one non-blank line here
	$total_vals = 0;
	$val = false;
	
	foreach ($s_lines as $s_line) {
		if (preg_match('/\S/', $s_line)) {
			++$total_vals;
			$val = $s_line;
		}
	}

	if ($total_vals > 1) {
		handleError('too many values found for ' . $key, '!' . $key);
	}
	
	if (!$val) {
		handleError('no values found for ' . $key, '!' . $key);
	}
	
	if (!preg_match('/^\d+$/', $val)) {
		handleError('the value found for ' . $key . ' is not a number (' . $val . ')', $key);
	}
	
	$conf["$type"] = $val;
	
	return $conf;
}

function parsePartyConfig_parseStanzas__partyType($s_lines, $type, $conf) {
	$conf['parties']["$type"] = parsePartyConfig_parseStanzas_parseDates($s_lines);

	return $conf;
}

function parsePartyConfig_parseStanzas__simple($s_lines, $key, $conf, $type = 'multiple') {
	$conf["$key"] = $s_lines;
	
	if ($type == 'single') {
		if (count($s_lines) > 1) {
			handleError('too many values for ' . $key, $key);
		}
		
		$conf["$key"] = $s_lines[0];
	}
	
	return $conf;
}

function parsePartyConfig_parseStanzas__whitelist($s_lines, $conf) {
	//these lines will be stanzas in themselves...keys that can be converted to dates,
	//followed by time slots and lengths
	
	$conf['whitelist'] = parsePartyConfig_parseStanzas_parseDates($s_lines);

	return $conf;
}

function parsePartyConfig_parseStanzas_parseDates($lines) {
	global $DATE_FORMAT;

	$dates = array();
	$this_date_data = array();
	$this_date_name = false;
	$last_line_str = false;
	
	$wdays = array(
		'sun',
		'mon',
		'tue',
		'wed',
		'thu',
		'fri',
		'sat'
	);
	
	foreach ($lines as $line) {
		$is_key = false;
		$is_data = false;
		$new_key = false;
	
		//is it a time slot/length pairing OR a time range/length pairing?
		//4p 2h,3h
		//4p-9p 2h,3h
		if (
			preg_match('/^\s*(\d+\:?\d*)(a|p)\s+(.+)$/', $line, $cap)
			|| preg_match('/^\s*(\d+\:?\d*)(a|p)\s*\-\s*(\d+\:?\d*)(a|p)\s+(.+)$/', $line, $cap)
		) {
			//grab the string that represents the allowable lengths
			$lengths_txt = $cap[count($cap) - 1];
		
			$times = array();
		
			//if there are 4 elements in the grep'd string, just have a single
			//time
			if (count($cap) == 4) {
				$times[] = $cap[1] . $cap[2];
			}
			
			//otherwise, build out a range
			else {
				global $TIME_SLOT_INCREMENT;
				$times = buildTimeRange($cap[1] . $cap[2], $cap[3] . $cap[4], $TIME_SLOT_INCREMENT);
			}
			
			$lengths = preg_split('/\s*\,\s*/', strtolower($lengths_txt));
			$all_lengths_good = true;
			foreach ($lengths as $length) {
				if (!preg_match('/^\d+[a-z]$/', $length)) {
					$all_lengths_good = false;
				}
			}
			
			if ($all_lengths_good) {
				$is_data = true;
				
				foreach ($times as $time) {
					if (isset($this_date_data[$time])) {
						handleError('multiple values in one day for ' . $time, $line);
					}
				
					$this_date_data[$time] = $lengths;
				}
			}
		}
	
		
	
		//is it a key, which could be either a weekday, a specific day, or a
		//comma separated list of either?
		$safe_line = strtolower($line);
		$is_date_key = true;
		$line_chunks = preg_split('/\s*,\s*/', $safe_line);
		foreach ($line_chunks as $line_chunk) {
			$this_chunk_is_date = false;
			
			//looking for either a string in the 'wdays' array...
			if (preg_match('/^[a-z]+$/', $line_chunk)) {
				$short_line = substr($line_chunk, 0, 3);
				if (in_array($short_line, $wdays)) {
					$this_chunk_is_date = true;
				}
			}
			
			//...or failing that a date that can be converted via strtotime()
			if (!$this_chunk_is_date) {
				if (strtotime($line_chunk) !== false) {
					$this_chunk_is_date = true;
				}
			}
			
			if ($is_date_key && !$this_chunk_is_date) {
				$is_date_key = false;
			}
		}
			
		if ($is_date_key) {
			$is_key = true;
			$new_key = $safe_line;
		}	
		
		
	
	
	
		
		
		//if none of the above, barf.
		if (!$is_key && !$is_data) {
			handleError("don't know what to do with the config line " . $line, $line);
		}
		
		
		//if we're at a key, time to read in the last set of data if it existed
		if ($is_key) {
			if (count($this_date_data) > 0) {
				if (isset($dates["$this_date_name"])) {
					handleError('multiple party days named ' . $this_date_name, $last_line_str);
				}
			
				$dates["$this_date_name"] = $this_date_data;
			}
			
			$this_date_data = array();
			$this_date_name = $new_key;
		}
		
		$last_line_str = $line;
	}
	

	//now we're at the end; need to grab the last set of data
	if (count($this_date_data) > 0) {
		if (isset($dates["$this_date_name"])) {
			handleError('multiple entries named ' . $this_date_name, $line);
		}
	
		$dates["$this_date_name"] = $this_date_data;
	}
	
	//we now have a built out list of date/time objects for this stanza. any of
	//those date keys may actually be a compound object consisting of multiple
	//weekdays and dates. want to expand those now.
	$dates = expandDateObjects($dates);
	
	return $dates;
}

function sendConfirmation($form, $config) {
	$headers = sendConfirmation_deriveHeaders($config['confirmation_email_body'], $config['confirmation_email_from']);
	$msg = join("\n", $config['confirmation_email_body']);

	mail($form['email'], $config['confirmation_email_subj'], $msg, $headers);
}

function sendConfirmation_deriveHeaders($msg, $from = 'info@RoyalPalmsShuffle.com') {
	$is_html = false;
	
	foreach ($msg as $line) {
		if (preg_match('/\<\s*html/', $line)) {
			$is_html = true;
			break;
		}
	}
	
	$headers = 'From: Royal Palms Shuffleboard <' . $from . '>' . "\r\n";
	
	if ($is_html) {
		$headers .= 'MIME-Version: 1.0' . "\r\n";
		$headers .= 'Content-type: text/html; charset=iso-8859-1' . "\r\n";
	}
	
	return $headers;
}

function sendReservation($form, $to_addr, $subj) {
	//build our message and send it
	$msg = array();

	//a few things in order, then the remainder
	$msg[] = 'name: ' . $form['name'];
	$msg[] = 'guests: ' . $form['guests'];
	$msg[] = 'beverage package: ' . preg_replace("/_/", ' ', $form['beverage_package']);
	unset($form['name']);
	unset($form['guests']);
	unset($form['beverage_package']);
	

	foreach ($form as $k=>$v) {
		$k = preg_replace("/_/", ' ', $k);
		$msg[] = $k . ": " . $v;
	}

	$sent = mail($to_addr, $subj, join("\n", $msg));
	if ($sent) {
		print 'ok';
	} else {
		handleError("We were unable to send the reservation request. Please try again.");
	}
}

function skippable($line) {
	$skippable = false;
	
	//ignore comments and blank lines
	if (preg_match('/^\s*\#/', $line) || preg_match('/^\s*$/', $line)) {
		$skippable = true;
	}
	
	return $skippable;
}