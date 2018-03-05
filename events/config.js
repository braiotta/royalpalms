$.noConflict();

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
	//pull in the list of available configs
	getConfigs();
});


function getConfigs() {
	$.ajax({
		type		: 'Post',
		url			: 'party.php',
		data		: 'function=getConfigs',
		cache		: false,

		success:	function(return_val) {
			getConfigs_cb(return_val);
		}
	});

}

function getConfigs_cb(return_val) {
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
	
	configs = jQuery.parseJSON( return_val );
	
	if (configs.length == 0) {
		alert('sorry, no config files found!');
		return false;
	}
	
	$('#config_menu').empty();
	for (var i=0; i < configs.length; i++) {
		var this_config = configs[i];
		var safe_config_name = makeJSSafe(this_config);
		this_config = decodeURIComponent(this_config);
		
		var config_box =
			"<h3 class='config_menu_title' id='config_menu_title_" + safe_config_name + "'>" + this_config + "<h3>\n" +
			"<div class='config_menu_guts' id='config_menu_guts_" + safe_config_name + "'></div>\n";
		
		$('#config_menu').append(config_box);
	}
	$('#config_menu').accordion({
		collapsible: true,
		heightStyle: "content",
		active: false
	});
	
	//click behavior for configs
	$( '.config_menu_title' ).on('click', function(){
		//when opening, run test on config
		if ($(this).hasClass('ui-state-active')) {
			runTestConfig($(this).attr('id').replace(/^config_menu_title_/, ''));
		}
	});
}

function makeJSSafe(str) {
	var old_str = str;

	str = encodeURIComponent(str);
	str = str.replace(/\+/g, '__PLUS__');
	str = str.replace(/\%/, '__PERCENT__');
	str = str.replace(/\./g, '__DOT__');
	
	return str;
}

function parseSlotData(data) {
	var slot_data = '';

	for (var date in data) {
		var time_data = data[date];
		slot_data += date + ': ';
		for (var time in time_data) {
			var durations = time_data[time];
			slot_data += time + '(' + durations.join(', ') + '), ';
		}
		slot_data = slot_data.replace(/, $/, '');
		slot_data += '<br /><br />';
	}
	
	return slot_data;
}

function runTestConfig(config) {
	//throw a waiting indicator in the body
	var target_title = 'config_menu_title_' + makeJSSafe(config);
	var target_guts = 'config_menu_guts_' + makeJSSafe(config);
	
	$( '#' + target_guts ).html('<img src="./bar_indicator.gif" />');

	$.ajax({
		type		: 'Post',
		url			: 'party.php',
		data		: 'function=testConfig&config_name=' + config,
		cache		: false,

		success:	function(return_val) {
			runTestConfig_cb(return_val);
		}
	});
}

function runTestConfig_cb(return_val) {
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
	
	var return_data = jQuery.parseJSON( return_val );
	var html = [];
	
	
	html[html.length] = "<p style='font-size: .75em; margin:0; padding: 0;'><i>(close and re-open to reload)</i></p>";
	
	//any errors?
	if (return_data['errors'].length > 0) {
		html[html.length] = "<h4 style='color: red; font-size: 1.5em;'>" + return_data['errors'].length + " error(s) found</h4>";
		html[html.length] = "<ul>";
		for (var i=0; i < return_data['errors'].length; i++) {
			var error_str = return_data['errors'][i];
			error_str = error_str.replace(/ \(line/, " <span class='error_str_line_no'> (line");
			error_str = error_str.replace(/\)$/, ")</span>");
		
			html[html.length] = "<li>" + error_str + "</li>";
		}
		html[html.length] = "</ul>";
	}
	
	//no errors, hooray, and show config details
	else {
		html[html.length] = "<h4 style='color: green; font-size: 1.5em;'>no errors found</h4>";
		
		html[html.length] = "<div style='font-size:.75em;'>";

		//regular days available
		if (return_data['config']['parties']['regular']) {
			var slot_data = parseSlotData(return_data['config']['parties']['regular']);
			
			html[html.length] = "<p class='config_detail'><u>regular parties</u>:<br /><br />"
				 + slot_data
				 + "</p>";	
		} else {
			html[html.length] = "<p class='config_detail'>no regular parties are defined</p>";
		}
		
		if (return_data['config']['parties']['premium']) {
			var slot_data = parseSlotData(return_data['config']['parties']['premium']);
			
			html[html.length] = "<p class='config_detail'><u>premium parties</u>:<br /><br />"
				 + slot_data
				 + "</p>";	
		} else {
			html[html.length] = "<p class='config_detail'>no premium parties are defined</p>";
		}
		
		if (return_data['config']['parties']['big regular']) {
			var slot_data = parseSlotData(return_data['config']['parties']['big regular']);
			
			html[html.length] = "<p class='config_detail'><u>big regular parties</u>:<br /><br />"
				 + slot_data
				 + "</p>";	
		} else {
			html[html.length] = "<p class='config_detail'>no big regular parties are defined</p>";
		}
		
		if (return_data['config']['parties']['big premium']) {
			var slot_data = parseSlotData(return_data['config']['parties']['big premium']);
			
			html[html.length] = "<p class='config_detail'><u>big premium parties</u>:<br /><br />"
				 + slot_data
				 + "</p>";	
		} else {
			html[html.length] = "<p class='config_detail'>no big premium parties are defined</p>";
		}
		
		
		
		//blacklist stuff
		if (return_data['config']['blacklist'] && return_data['config']['blacklist'].length > 0) {
			html[html.length] = "<p class='config_detail'>the following dates are blacklisted:<br /><br />" + return_data['config']['blacklist'].join(", ") +"</p>";
		}
		
		//everything else
		html[html.length] = "<p class='config_detail'>when a person submits a request, the popup says:<br /><br />\"<i>" + decodeURIComponent(return_data['config']['confirmation_popup']).replace(/\+/g, ' ') +"</i>\"</p>";
		
		if (return_data['config']['confirmation_email_send']) {
			html[html.length] = "<p class='config_detail'>when a person submits a request, an email <b>IS</b> sent</p>";
			html[html.length] = "<p class='config_detail'>when a person submits a request, the email subject is:<br /><br />\"<i>" + decodeURIComponent(return_data['config']['confirmation_email_subj']).replace(/\+/g, ' ') +"</i>\"</p>";
			html[html.length] = "<p class='config_detail'>when a person submits a request, the email body is:<br /><br />\"<i>" + return_data['config']['confirmation_email_body'].join("__NEWLINE__").replace(/\</g, '&lt;').replace(/\>/g, '&gt;').replace(/__NEWLINE__/g, '<br /><br />') +"</i>\"</p>";
			html[html.length] = "<p class='config_detail'>when a person submits a request, the message is sent from:<br /><br />" + return_data['config']['confirmation_email_from'] +"</p>";
		}
		
		else {
			html[html.length] = "<p class='config_detail'>when a person submits a request, an email is <b>NOT</b> sent</p>";
		}
		
		html[html.length] = "<p class='config_detail'>a big party is defined as:<br /><br />" + return_data['config']['big'] + " people</p>";
		html[html.length] = "<p class='config_detail'>a TOO big party is defined as:<br /><br />" + return_data['config']['malthusian'] + " people</p>";
		html[html.length] = "<p class='config_detail'>when a party is too big, the message says:<br /><br />" + return_data['config']['malthus_msg'].replace(/__var__/, return_data['config']['malthusian']) + "</p>";
		html[html.length] = "<p class='config_detail'>you can't reserve a party after:<br /><br />" + return_data['config']['horizon'] + " days</p>";
		html[html.length] = "<p class='config_detail'>league nights are:<br /><br />" + return_data['config']['league'].join(', ') + "</p>";
		html[html.length] = "<p class='config_detail'>people who try to reserve league nights are told:<br /><br />\"<i>" + return_data['config']['league_msg'].join("<br /><br />") + "</i>\"</p>";
		html[html.length] = "<p class='config_detail'>people who try to reserve other unavailable nights are told:<br /><br />\"<i>" + return_data['config']['std_msg'].join("<br /><br />") + "</i>\"</p>";
		
		html[html.length] = "</div>";
	}
	
	var target_guts = 'config_menu_guts_' + makeJSSafe(return_data['config_name']);
	$( '#' + target_guts ).html(html.join("\n"));
}

} ) ( jQuery );