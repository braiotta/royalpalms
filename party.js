$.noConflict();

var mon_message = "Sorry! Mondays are league nights. You can't reserve a party on these days.";
var horizon_message;

var blacklisted = false;
var config = new Object();
var day_slots = new Object();
var party_key = false;
var popup_active = false;
var which_bev_package = false;


var wdays = [
	'sun',
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat'
];

( function($) {
$( document ).ready(function() {
	//enable the form and the submit button
	$("#partyform").prop('disabled', false);
	$("#submit").prop('disabled', false);

	//activate the date picker
	$( "#date" ).datepicker();

	//load the config data from ajax
	initialize_loadPartyConfig();



	
	//have some work to do when a user picks a bev package or a # of guests
	$( '#guests' ).on('change', function() {
		revealDateInputs();
		handleDateChoice();
		handleTimeChoice();
	});
	
	$( '.beverage_package' ).on('change', function() {
		revealDateInputs();
		handleDateChoice();
		handleTimeChoice();
	});
	
	//have some work to do when user picks a date
	$( "#date" ).on('change', function() {
		handleDateChoice();
		handleTimeChoice();
	});
	
	//have some work to do when user picks a time slot
	$( "#time" ).on('change', function() {
		handleTimeChoice();
	});

	
	
	
	
	//form submission
	$( '#partyform' ).submit(function() {
		handleFormSubmit();
	});
	
	//only allow numbers in # of guests input
	$( '#guests' ).on('keyup', function() {
		enforceKeystrokes_number($(this));
	});
	
	//on blur # of guests, check if over limit. if so, warning (and disable form)
	$( '#guests' ).on('blur', function() {
		checkGuestOverpop();
	});
	
	//activate the dismiss button for the overpop popup
	$( '#overpop_popup_ok' ).on('click', function() {
		popup('overpop', 'hide');
	});
});



function buildTimeSelect(day) {
	//get start and end as defined by keys of day_slots object
	day_slot_times = Object.keys(day_slots);
	
	$( '#time' ).empty();
	$( '#time' ).append( $("<option>")
		.val('----')
		.html('pick a time')
	);
	for (var i=0; i < day_slot_times.length; i++) {
		var time_option = day_slot_times[i];
	
		$( '#time' ).append( $("<option>")
			.val(time_option)
			.html(time_option)
		);
	}
	$( '#time' ).val('----');
}

/*
function buildTimeSelect_range(bounds) {
	var start = bounds[0];
	var end = bounds[1];
	
	var times = [start];
	var last_time = start;
	
	var loops = 0;
	var done = false;
	while (!done) {
		if (last_time.match(/^(\d+)\:(\d+)(\w)$/)) {
			var hour = parseInt(RegExp.$1);
			var min = parseInt(RegExp.$2);
			var am_pm = RegExp.$3;
			
			//Add 30 minutes to min
			min += 30;
			
			//Did we reach minute 60? If so, set to 0 and increase hour
			if (min == 60) {
				min = 0;
				hour += 1;
			}
			
			//Did we reach hour 13? If so, switch to 1.
			if (hour == 13) {
				hour = 1;
			}
			
			//did we reach hour 12? toggle am_pm
			if (hour == 12) {
				if (am_pm == 'a') {
					am_pm = 'p';
				} else {
					am_pm = 'a';
				}
			}
			
			var min_txt = min;
			if (min_txt == 0) {
				min_txt = '00';
			}
			
			var new_time = hour + ':' + min_txt + am_pm;
			times[times.length] = new_time;
			last_time = new_time;
			if (new_time == end) {
				done = true;
			}
		}
	
		++loops;
		if (loops > 48) {
			alert('Sorry, something went wrong building the available times of day.');
			return false;
		}
	}
	
	return (times);
}
*/

function checkGuestOverpop() {
	var guests = parseInt($( '#guests' ).val());
	
	if (guests >= config['malthusian']) {
		var msg = config['malthus_msg'];
		msg = msg.replace(/__var__/, config['malthusian']);
		$( '#overpop_popup_msg' ).html(msg);
		popup('overpop', 'reveal');
		return false;
	}
	
	return true;
}

function derivePartyType() {
	party_key = 'regular';
	
	//did the user select a premium beverage package?
	if (
		which_bev_package.match(/_premium$/)
		|| which_bev_package.match(/_house\-kegged_cocktails$/)
	) {
		party_key = 'premium';
	}
	
	//did the user meet the "big" party criteria?
	var is_big_party = false;
	var big_party_line = config['big'];
	var party_size = $('#guests').val();
	if (party_size.match(/^\d+$/) && party_size >= big_party_line) {
		is_big_party = true;
	}
	
	if (is_big_party) {
		party_key = 'big ' + party_key;
	}
}

function enforceKeystrokes_number(input) {
	var stripped_txt = input.val();
	stripped_txt = stripped_txt.replace(/\D/, '');
	input.val(stripped_txt);
}

function handleDateChoice() {
	//don't bother if not selected
	if (!$('#date').val() || $('#date').val().length == 0) {
		return false;
	}

	var date = $('#date').datepicker('getDate');
	var wday = date.getUTCDay();

	//More than [horizon] days out? Error.
	if (handleDateChoice_checkHorizon()) {
		handleDateChoice_reset();
		alert(horizon_message);
	}
	
	var available_check = handleDateChoice_checkIsAvailable(date, wday);
	var is_available = available_check[0];
	day_slots = available_check[1];
	
	//if that day's available, populate times
	if (is_available) {
		buildTimeSelect();
		
		//hide the length field
		$( '#partydata_length' ).css('display', 'none');
	}
	
	//if the day is not available, reset & warn appropriately
	else {
		handleDateChoice_unavailable(wday);
	}
}

function handleDateChoice_checkHorizon() {
	var today = new Date();
	var chosen_date = $( '#date' ).val();
	var chosen_date_array = chosen_date.split('/');
	var chosen_date_obj = new Date(parseInt(chosen_date_array[2]), parseInt(chosen_date_array[0]) - 1, parseInt(chosen_date_array[1]));
	var diff = chosen_date_obj - today;
	diff = Math.round(diff/1000/60/60/24)
	
	var max_horizon = config['horizon'];
	
	if (diff > max_horizon) {
		horizon_message = "Sorry! We cannot accept reservations beyond " + config['horizon'] + " days in advance.";
		return true;
	}

	return false;
}

function handleDateChoice_checkIsAvailable(date, wday_num) {
	var available = false;
	blacklisted = false;
	var choice_slots = new Object();

	var short_date = String(date);
	short_date = short_date.replace(/^\w{3} /, '');
	short_date = short_date.replace(/ \d{2}\:\d{2}\:\d{2} \w{3}\-\d+ \(\S+\)$/, '');
	short_date = short_date.toLowerCase();

	//is it blacklisted? immediate deny.
	if (config['blacklist']) {
		for (var i=0; i < config['blacklist'].length; i++) {
			var this_blist = config['blacklist'][i];
			if (this_blist == short_date) {
				blacklisted = true;
				return [available, choice_slots];
			}
		}
	}
	
	//before we check wday-based slots, see if the specific date has been set. this allows
	//us to override non-date specific times.
	if (config['parties'][party_key] && config['parties'][party_key][short_date]) {
		available = true;
		choice_slots = config['parties'][party_key][short_date];
	}
	
	//not defined for specific day? check if it has normal wday-based slots.
	if (!available) {
		var wday = wdays[wday_num];
		if (config['parties'][party_key] && config['parties'][party_key][wday]) {
			available = true;
			choice_slots = config['parties'][party_key][wday];
		}
	}
	
	return [available, choice_slots];
}

function handleDateChoice_reset() {
	$( '#date' ).val('');
	$( '#time' ).empty();
	$( '#time' ).append( $("<option>")
		.val('select a date first')
		.html('select a date first')
	);
}

function handleDateChoice_unavailable(wday) {
	//basic message if simply unavailable (such as blacklist)
	var which_msg = config['std_msg'];
	
	//if the night in question is a league night, give the league night message
	if (config['league']) {
		var wday_name = wdays[wday];
		for (var i=0; i<config['league'].length; i++) {
			var this_league_night = config['league'][i];
			this_league_night = this_league_night.substr(0,3).toLowerCase();
			if (this_league_night == wday_name) {
				which_msg = config['league_msg'];
			}
		}
	}
	
	alert(which_msg);

	handleDateChoice_reset();
}

function handleFormSubmit() {
	if (popup_active) {
		return false;
	}

	var form = handleFormSubmit_gatherData();
	var valid = handleFormSubmit_validate(form);
	if (valid) {
		handleFormSubmit_submit(form);
	}
}

function handleFormSubmit_gatherData() {
	//gather data
	var form = {};
	$( '.partydata' ).each(function() {
		var k = $(this).attr('id');
		
		//if it's a radio button, add if selected
		if ($(this).is(':radio')) {
			if ($(this).is(':checked')) {
				k = k.replace(/_\d+$/, '');
				form[k] = $(this).val();
			}
		}
		
		//otherwise just add it
		else {
			form[k] = $(this).val();
		}
	});
	
	return form;
}

function handleFormSubmit_submit(form) {
	popup('waiting', 'reveal');

	var form_json = Object.toJSON(form);

	$.ajax({
		type		: 'Post',
		url			: 'party.php',
		data		: 'function=submitReservation&form_json=' + form_json,
		cache		: false,

		success:	function(return_val) {
			handleFormSubmit_submit_cb(return_val);
		}
	});
}

function handleFormSubmit_submit_cb(return_val) {
	popup('waiting', 'hide');

	msg = decodeURIComponent(config['confirmation_popup']).replace(/\+/g, ' ');
	
	if (return_val.match(/^ERROR::(.+)$/)) {
		msg = RegExp.$1;
		msg = msg.replace(/_NEWLINE_/g, "\n");
	}
	
	else if (return_val != 'ok') {
		msg = "Sorry, something mysterious went wrong. Please let us know.";
	}
	
	alert(msg);
}

function handleFormSubmit_validate(form) {
	var errors = [];
	
	//is there a name
	if (!form['name'].match(/.+ .+/) || !form['name'].match(/[a-z|A-Z]/)) {
		errors[errors.length] = 'Please provide a first and last name.';
	}
	
	//is there a good email addr (don't actually care how exact this is;
	//basically want to know if it looks SOMETHING like an email address.
	if (!form['email'].match(/^.+\@.+\..+$/)) {
		errors[errors.length] = 'Please provide a real email address.';
	}
	
	//is there a good phone number (only care that it has 10+ digits)
	var phone = form['phone'];
	phone = phone.replace(/\D/g, '');
	if (phone.length < 10) {
		errors[errors.length] = 'Please provide a real phone number.';
	}
	
	//is there a date (comes from the datepicker, so has predictable format)
	if (!form['date'].match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
		errors[errors.length] = 'Please pick a valid date.';
	}
	
	//check date is the future
	var date = form['date'];
	var date_array = date.split("/");
	date_obj = new Date(date_array[2], date_array[0] -1, date_array[1]);
	var today_date = new Date();
	if (today_date >= date_obj) {
		errors[errors.length] = 'The date you choose has to be in the future.';
	}
	
	//is there a # of guests
	if (form['guests'].length < 1) {
		errors[errors.length] = 'Please say how many guests are coming.';
	}
	
	//if # of guests is provided, must be a number >= 10.
	if (!form['guests'].match(/^\d+$/) || parseInt(form['guests']) < 10) {
		errors[errors.length] = 'The number of guests has to be a number 10 or greater.';
	}
	
	//is there a bev package
	if (!form['beverage_package'] || form['beverage_package'].length < 1) {
		errors[errors.length] = 'Please select a beverage package.';
	}
	
	//is there a time chosen
	if (!form['time'] || form['time'] == '----') {
		errors[errors.length] = 'Please select a time.';
	}
	
	//if errors, report and return false
	if (errors.length > 0) {
		var msg = "Sorry! You need to fix these problems to reserve a party:\n\n";
		msg += '* ' + errors.join("\n* ");
		alert(msg);
		
		return false;
	}
	
	if (!checkGuestOverpop()) {
		return false;
	}
	
	return true;
}

function handleTimeChoice() {
	//skip if time is empty
	if (!$('#time').val() || $('#time').val() == 'null' || $('#time').val() == '----') {
		return false;
	}

	var thetime = $( '#time' ).val();
	
	if (!day_slots[thetime]) {
		return false;
	}
	
	var lengths = day_slots[thetime];
	
	
	//populate the "lengths" pulldown
	$( '#length' ).empty();
	for (var i=0; i < lengths.length; i++) {
		var val = lengths[i];
		var html = '';
		if (val.match(/^(\d+)h$/)) {
			var length_num = RegExp.$1;
			var label = 'hour';
			if (parseInt(length_num) > 1) {
				label += 's';
			}
			
			html = length_num + ' ' + label;
		}
		
		$( '#length' ).append( $("<option>")
			.val(val)
			.html(html)
		);
	}
	
	//more than one option? reveal. otherwise, hide.
	var length_display = 'none';
	if (lengths.length > 1) {
		length_display = 'block';
	}
	$( '#partydata_length' ).css('display', length_display);
}

function initialize_loadPartyConfig() {
	$.ajax({
		type		: 'Post',
		url			: 'party.php',
		data		: 'function=loadPartyConfig',
		cache		: false,

		success:	function(return_val) {
			initialize_loadPartyConfig_cb(return_val);
		}
	});
}

function initialize_loadPartyConfig_cb(return_val) {
	return_val = return_val.replace(/^\s+/, '');
	if (return_val.match(/^ERROR::(.+)/)) {
		var msg = RegExp.$1;
		alert(msg);
		return false;
	}

	if (return_val.length < 2) {
		alert("Sorry, something mysterious went wrong. Please let us know.");
		return false;
	}
	
	config = jQuery.parseJSON( return_val );
}

function popup(popup_name, action) {
	var display = 'block';
	popup_active = true;
	
	if (action == 'hide') {
		display = 'none';
		popup_active = false;
	}
	
	var popup_id = popup_name + '_popup';
	
	$( '#shaded_body_block' ).css('display', display);
	$( '#shaded_popups_container' ).css('display', display);
	$( '#' + popup_id ).css('display', display);
}

/*
function popup_waiting(action) {
	var display = 'block';
	if (action == 'hide') {
		display = 'none';
	}
	
	$( '#shaded_body_block' ).css('display', display);
	$( '#shaded_popups_container' ).css('display', display);
	$( '#waiting_popup' ).css('display', display);
}
*/

function revealDateInputs() {
	var should_populate = revealDateInputs_check();
	if (should_populate) {
		revealDateInputs_execute();
	}	
}

function revealDateInputs_check() {
	//can't reveal the dates until have BOTH a number of guests AND a bev package
	$( '.beverage_package' ).each(function() {
		if ($(this).prop('checked')) {
			which_bev_package = $(this).val();
		}
	});
	
	var have_guests = false;
	if ($( '#guests' ).val().match(/^\d+$/)) {
		have_guests = true;
	}
	
	return have_guests && which_bev_package;
}

function revealDateInputs_execute() {
	//derive the "party key"; combination of size and bev package. defines which array
	//of times/days/lengths to grab.
	derivePartyType();
	
	//reveal date and time selectors
	$( '#partydata_date' ).css('display','block');
	$( '#partydata_time' ).css('display','block');
	
	//just for housekeeping, hide the length selector
	$( '#partydata_length' ).css('display','none');
}

} ) ( jQuery );