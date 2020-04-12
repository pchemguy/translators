{
	"translatorID": "26ce1cb2-07ec-4d0e-9975-ce2ab35c8343",
	"label": "a a Russian State Library RSL.ru",
	"creator": "PChemGuy",
	"target": "^https?://(search|favorites|aleph)\\.rsl\\.ru/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-04-12 21:08:03"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2020 PChemGuy

	This file is part of Zotero.

	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/

/*
	Testing/troubleshooting issues in Scaffold (valid as of April 2020):
	Care must be taken when loading an additional translator as a preprocessor.
	setTranslator:
		- does not throw any errors when invalid translator id is supplied;
		- does not provide any human readable feedback with translator name, so
		  even if a valid translator id for a wrong translator is supplied,
		  no immediate feedback is supplied.
	In both cases "Translation successful" status is likely to be returned.
	Working environment: Windows 7 x64
*/

/*
	RSL has two primary catalog interfaces:
		https://search.rsl.ru (sRSL)
		http://aleph.rsl.ru (aRSL)
	search.rsl.ru records can be accessed via search.rsl.ru/(ru|en)/record/<RID>
	aleph.rsl.ru is a total mess, a very basic partial support for single record 
	saving is implemented.
	
	search.rsl.ru/(ru|en)/download/marc21?id=<RID> interface provides access to 
	binary MARC21 records, but requires prior authentication, so they are not used.
	
	Translator's logic for both catalogs involves parsing the web page into MARCXML,
	loading MARCXML translator for initial processing, followed by postprocessing as
	necessary.
	
	Postprocessing for search.rsl.ru aslo involves parsing of the human readable
	description to harvest additional metadata.
	
	TODO:
	search.rsl.ru - some records contain expandable "Consists of" or "Periodicals"
	reference with an arrow, when displayed as part of a search result, and "Contents" 
	tab on the record page, referring to related/constituent records. Such references
	may potentially be processed via the "multiple" routine, but such processing 
	is not implemented.
*/


/*
	Item type is adjusted based on the catalog information. Present implementation
	assumes that each record belongs to a single catalog (it is not clear whether
	this is correct or not.)
	
	Russian style thesis abstracts are more like manuscripts, but they are assigned
	the "thesis" type, with additional type note added to the "Extra" field.
	
	At present, technical standards are commonly mapped to Zotero "report" due to
	lack of a dedicated type. Such a type is expected to be implemented in the near
	future, but	for the time being a type note is added to the "Extra" field.
	
	The following catalogs are supported. For items beloning to other catalogs no
	type adjustment is made.
*/
const catalog2type = {
	"Книги (изданные с 1831 г. по настоящее время)": "book",
	"Старопечатные книги (изданные с 1450 по 1830 г.)": "book",
	"Сериальные издания (кроме газет)": "journal",
	"Авторефераты диссертаций": "thesisAutoreferat",
	"Диссертации": "thesis",
	"Стандарты": "standard"
};

/*
	Filter strings used for extraction of metadata from
	https://search.rsl.ru/(ru|en)/record/<RSLID>
	https://search.rsl.ru/(ru|en)/search#
*/
const sRSL_filters = {
	libraryCatalog: "Российская Государственная Библиотека",
	marc_table_css: "div#marc-rec > table",
	desc_table_css: "table.card-descr-table",
	search_list_css: "span.js-item-maininfo",
	search_record_rslid_attr: "data-id",
	search_record_title: /^[^:/[]*/,
	rslid_prefix: "https://search.rsl.ru/ru/record/",
	thesis_rel_attr: "href",
	thesis_rel_prefix: "/ru/transition/",
	thesis_rel_css: 'a[href^="/ru/transition/"]',
	fav_rslid_css: "a.rsl-link",
	fav_desc_css: "div.rsl-fav-item-descr",
	catalog: "Каталоги",
	bbk: "BBK-код",
	call_number: "Места хранения",
	eresource: "Электронный адрес"
};

/*
	Filter strings for extraction of metadata from
	aleph.rsl.ru
*/
const aRSL_filters = {
	marc_table_tag_css: "td.td1[nowrap]",
	marc_table_val_css: "td.td1:not([nowrap])",
	marc_table_set_css: 'a[title="Добавить в подборку"]',
	record_marc_signature: "&format=001",
	record_standard_signature: "&format=999",
	record_format_regex: /&format=[0-9]{3}/,
	url_prefix: "http://aleph.rsl.ru/F/",
};


const base_eurl = 'https://dlib.rsl.ru/';


function attr(docOrElem, selector, attr, index) {
	var elem = index ? docOrElem.querySelectorAll(selector).item(index) : docOrElem.querySelector(selector);
	return elem ? elem.getAttribute(attr) : null;
}


function text(docOrElem, selector, index) {
	var elem = index ? docOrElem.querySelectorAll(selector).item(index) : docOrElem.querySelector(selector);
	return elem ? elem.textContent : null;
}


/**
 *	Adds link attachment to a Zotero item.
 *
 *  Note attachment creation issue.
 *  Problem manifestation:
 *  If 'linkMode: "linked_url"' is not present or is the last (possibly also in
 *  the middle) line in the object definition, the "title" property is ignored,
 *  e.g., for 'research.rsl.ru/ru/record/01004956040' the "title" is set to
 *  "01004956040" regardless of the specified title. If 'linkMode: "linked_url"'
 *  is the first member as below, the "title" field is set as expected. 
 * 
 *  There appear to be a bug in Zotero routine that creates attachments from JSON 
 *  definitions. "linkMode" property affects (determines?) the type of the new 
 *  attachment and interpretation of the remaining properties. The routine 
 *  apparently enumerates keys of the supplied JSON object, instead of accessing
 *  "linkMode" directly. It processes properties in the order supplied, and if 
 *  "linkMode" does not come first, may not process earlier properties correctly. 
 *  This is particularly problematic, since there is no guaranteed order of members 
 *  in a dictionary, though, apparently, in simple cases at least the members are 
 *  returned in the "added first" order. However, this behavior is not relaibly 
 *  reproducible.
 *  Windows 7 x64, April 2020.
 *
 *	@param {Object} item - Zotero item
 *	@param {String} title - Link name
 *	@param {String} url - Link url
 *
 *	@return {None}
 */
function addLink(item, title, url) {
	item.attachments.push({
		linkMode: "linked_url", // Apparently, should be the first
		title: title,
		snapshot: false, 
		contentType: "text/html",
		url: url });
}


/*
	Scaffold issue (valid as of April 2020):
	When detectWeb is run via
		- "Ctrl/Cmd-T", "doc" receives "object HTMLDocument";
		- "Run test", "doc" receives JS object (not sure about details).
	Both objects have doc.location.host defined.
	
	When tester runs a web translator on a search results page, it fails to
	present the search result selection dialog and throws an error:
	"Error: Translator called select items with no items"
	
	When tester is called on "https://search.rsl.ru/ru/search#q=math", the part
	starting with the hashtag is lost and not passed to the processing function
	(not available from either "url" or "doc").
	
	Working environment: Windows 7 x64
*/
function detectWeb(doc, url) {
	let domain = url.match(/^https?:\/\/([^/]*)/)[1];
	let subdomain = domain.slice(0, -'.rsl.ru'.length);
	let pathname = doc.location.pathname;
	//Z.debug(subdomain);
	switch(subdomain) {
		case 'search':
			if (pathname.indexOf('/search') != -1) {
				return 'multiple';
			} else if (pathname.indexOf('/record/') != -1) {
				let metadata = getRecordDescription_sRSL(doc, url);
				let itemType = metadata.itemType;
				//Z.debug(metadata);
				return itemType ? itemType : 'book';
			} else {
				Z.debug('Catalog section not supported');
				return false;
			}
			break;
		case 'aleph':
			/*
				There are other single record patterns, but the full repertoire
				is unclear. Only this pattern is supported
			*/
			if (url.indexOf('func=full-set-set') != -1) {
				return 'book';
			/*
				There are other single record patterns, but the full repertoire
				is unclear. Due to awful implementation, "multiple" is not supported.
			*/
			} else if (url.match(/func=(find-[abcm]|basket-short|(history|short)-action)/)) {
				Z.debug('Due to awful implementation, "multiple" is not supported.');
				// return 'multiple';
				return false;
			} else {
				Z.debug('Catalog section not supported');
				return false;
			}
			break;
		default:
			Z.debug('Subdomain not supported: ' + subdomain);
			return false;
	}
}


/*
	Scaffold issue (date detected: April 2020):
	When detectWeb is run via
		"Ctrl/Cmd-T", "doc" receives "HTMLDocument object";
		"Run test", "doc" receives JS object (not sure about details).
	Working environment: Windows 7 x64
*/
function doWeb(doc, url) {
	// Zotero.debug(doc);
	// Z.debug(doc.toString());
	let domain = url.match(/^https?:\/\/([^/]*)/)[1];
	let subdomain = domain.slice(0, -'.rsl.ru'.length);
	if (detectWeb(doc, url) != 'multiple') {
		switch(subdomain) {
			case 'search':
				scrape(doc, url);
				break;
			case 'aleph':
				if (url.indexOf(aRSL_filters.record_marc_signature) != -1) {
					scrape(doc, url);
				} else {
					let href = aRSL_filters.url_prefix + '?' + 
					           url.split('?')[1].replace(aRSL_filters.record_format_regex, 
														 aRSL_filters.record_marc_signature);
					ZU.processDocuments([href], scrape);
				}
				break;
			default:
				Z.debug('Subdomain not supported');
				return false;
		}
	} else {
		getSearchResults(doc, url);
		Zotero.selectItems(getSearchResults(doc, url),
			function (records) {
				if (records) ZU.processDocuments(Object.keys(records), scrape);
			}
		);
	}
}


function scrape(doc, url) {
	// Convert HTML table of MARC record to MARCXML
	let record_marcxml;
	let scrape_callback;
	let domain = url.match(/^https?:\/\/([^/]*)/)[1];
	let subdomain = domain.slice(0, -'.rsl.ru'.length);
	switch(subdomain) {
		case 'search':
			record_marcxml = getMARCXML_sRSL(doc, url);
			scrape_callback = scrape_callback_sRSL;
			break;
		case 'aleph':
			record_marcxml = getMARCXML_aRSL(doc, url);
			scrape_callback = scrape_callback_aRSL;
			break;
		default:
			Z.debug('Subdomain not supported');
			return false;
	}
	//Z.debug('\n' + record_marcxml);
	
	// call MARCXML translator
	const MARCXML_tid = 'edd87d07-9194-42f8-b2ad-997c4c7deefd';
	var trans = Zotero.loadTranslator('import');
	trans.setTranslator(MARCXML_tid);
	trans.setString(record_marcxml);
	trans.setHandler('itemDone', scrape_callback(doc, url));
	trans.translate();
}


/*
	Additional processing after the MARCXML translator for search.rsl.ru
	Adjust item type based on catalog information for supported catalogs. For 
	types not available in Zotero, "type" annotation is added to the "extra" 
	field. Add the following information: 
		RSL record ID,
		call numbers (semicolon separated),
		catalog/item type,
		BBK codes (semicolon separated),
		electronic url, if available.
*/
function scrape_callback_sRSL(doc, url) {
	function callback(obj, item) {
		//Zotero.debug(item);
		let metadata = getRecordDescription_sRSL(doc, url);
		//Z.debug(metadata);
		if (metadata.itemType) {
			item.itemType = metadata.itemType;
		}
		item.url = metadata.url;
		item.libraryCatalog = sRSL_filters.libraryCatalog;
		item.callNumber = metadata[sRSL_filters.call_number];
		item.archive = metadata[sRSL_filters.catalog];
		let extra = [];
		extra.push('RSLID: ' + metadata.rslid)
		if (metadata.extraType) {
			extra.push('Type: ' + metadata.extraType);
		}
		if (metadata[sRSL_filters.bbk]) {
			extra.push('BBK: ' + metadata[sRSL_filters.bbk]);
		}
		if (item.extra) {
			extra.push(item.extra);
		}
		item.extra = extra.join('\n');
		
		//Z.debug(item.attachments[0]);
		metadata.related_url.forEach(link => addLink(item, link.title, link.url));
		
		//Z.debug(item);
		item.complete();
	}
	return callback;
}


/*
	Additional processing after the MARCXML translator for aleph.rsl.ru
*/
function scrape_callback_aRSL(doc, url) {
	function callback(obj, item) {

		// RSLID
		let add2set = attr(doc, aRSL_filters.marc_table_set_css, 'href');
		let RSLID = add2set.match(/&doc_library=RSL([0-9]{2})/)[1] + 
					add2set.match(/&doc_number=([0-9]{9})/)[1]
		let extra = ['RSLID: ' + RSLID];
		if (item.extra) { extra.push(item.extra); }
		item.extra = extra.join('\n');
		
		item.url = aRSL_filters.url_prefix + '?' + 
				   url.split('?')[1].replace(aRSL_filters.record_format_regex, 
											 aRSL_filters.record_standard_signature);

		let metadata = {};
		metadata.related_url = [];
		href = sRSL_filters.rslid_prefix + RSLID;
		metadata.related_url.push({title: "search.rsl.ru", url: href});

		metadata.related_url.forEach(link => addLink(item, link.title, link.url));

		//Z.debug(item);
		item.complete();
	}
	return callback;
}


function getSearchResults(doc, url) {
	var records = {};
	var rows = doc.querySelectorAll(sRSL_filters.search_list_css);

	// ZU.processDocuments(url, function (doc, url) { Z.debug(doc); });
	// ZU.doGet(url, function (responseText, response, url) { Z.debug(response); });
	
	for (let row of rows) {
		let href = sRSL_filters.rslid_prefix + 
				   row.getAttribute(sRSL_filters.search_record_rslid_attr);
		let title = row.innerText.match(sRSL_filters.search_record_title)[0];
		records[href] = title;
	}
	return records;
}


/**
 *	Parses record table with MARC data https://search.rsl.ru/(ru|en)/record/<RSLID>. 
 *  Returned MARCXML string can be processed using the MARCXML import translator.
 *
 *	@return {String} - MARCXML record 
 */
function getMARCXML_sRSL(doc, url) {
	let irow = 0;

	let marc21_table_rows = doc.querySelector(sRSL_filters.marc_table_css).rows;
	let marcxml_lines = [];

	marcxml_lines.push(
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<record xmlns="http://www.loc.gov/MARC21/slim" type="Bibliographic">',
		'    <leader>' + marc21_table_rows[0].cells[1].innerText.replace(/#/g, ' ') + '</leader>'
	);
	irow++;
	
	// Control fields
	for (irow; irow < marc21_table_rows.length; irow++) {
		let cur_cells = marc21_table_rows[irow].cells;
		let field_tag = cur_cells[0].innerText;
		let field_val = cur_cells[1].innerText;
		if (Number(field_tag) > 8) { break; }
		marcxml_lines.push(
			'    <controlfield tag="' + field_tag + '">' + field_val.replace(/#/g, ' ') + '</controlfield>'
		);
	}
	
	// Data fields
	for (irow; irow < marc21_table_rows.length; irow++) {
		let cur_cells = marc21_table_rows[irow].cells;
		let field_tag = cur_cells[0].innerText;

		/*
		  Subfield separator is '$'. Subfield separator always comes right after a tag,
		  so triple all '$' that follow immediately after '>' before stripping HTML tags
		  to prevent collisions with potential occurences of '$' as part of subfield contets. 
		*/
		cur_cells[1].innerHTML = cur_cells[1].innerHTML.replace(/\>\$/g, '>$$$$$$');
		field_val = cur_cells[1].innerText;
		let subfields = field_val.split('$$$');
		cur_cells[1].innerHTML = cur_cells[1].innerHTML.replace(/\$\$\$/g, '$$');
		let inds = subfields[0].replace(/#/g, ' ');

		// Data field tag and indicators
		marcxml_lines.push(
			'    <datafield tag="' + field_tag + '" ind1="' + inds[0] + '" ind2="' + inds[1] + '">'
		);
		
		// Subfields
		for (let isubfield = 1; isubfield < subfields.length; isubfield++) {
			// Split on first <space> character to extract the subfield code and its contents
			subfield = subfields[isubfield].replace(/\s/, '\x01').split('\x01');
			marcxml_lines.push(
				'        <subfield code="' + subfield[0] + '">' + subfield[1] + '</subfield>'
			);
		}
		
		marcxml_lines.push(
			'    </datafield>'
		);
	}

	marcxml_lines.push(
		'</record>'
	);
	
	return marcxml_lines.join('\n');
}


/**
 *	Parses record table with human readable bibliographic description on
 *  https://search.rsl.ru/(ru|en)/record/<RSLID> and constructs metadata object.
 *  Returned metadata object can be used for additional processing of the output
 *  produced by the MARCXML import translator.
 *
 *	@return {Object} - extracted metadata.
 */
function getRecordDescription_sRSL(doc, url) {
		let irow = 0;
		let metadata = {};
		let property_name = '';
		let property_value = '';
		let desc_table_rows = doc.querySelector(sRSL_filters.desc_table_css).rows;

		// Parse description table
		for (irow = 0; irow < desc_table_rows.length; irow++) {
			let cur_cells = desc_table_rows[irow].cells;
			let buffer = cur_cells[0].innerText;
			if (buffer) {
				metadata[property_name] = property_value;
				property_name = buffer;
				property_value = cur_cells[1].innerText;
			} else {
				property_value = property_value + '; ' + cur_cells[1].innerText;
			}
		}
		metadata[property_name] = property_value;
		delete metadata[''];
		
		// Record type
		let type = catalog2type[metadata[sRSL_filters.catalog]];
		if (type) {
			metadata.type = type;
			metadata.itemType = type;
		}
		
		// Record ID
		metadata.rslid = url.slice(sRSL_filters.rslid_prefix.length);

		// URL
		metadata.url = url; 
		
		// Array of link attachments: {title: title, url: url}
		metadata.related_url = [];
		
		// E-resource
		if (metadata[sRSL_filters.eresource]) {
			let eurl = base_eurl + metadata.rslid;
			metadata.related_url.push({title: "E-resource", url: eurl});
		} 
		
		// Workaround until implementation of a "technical standard" type
		if (type == 'standard') {
			metadata.itemType = 'report';
			metadata.extraType = type;
		}
		
		if (type == 'journal') {
			metadata.itemType = 'book';
			metadata.extraType = type;
		}

		// Complementary thesis/autoreferat record if availabless
		if (type == 'thesis') {
			let aurl = attr(doc, sRSL_filters.thesis_rel_css, sRSL_filters.thesis_rel_attr);
			if (aurl) {
				aurl = sRSL_filters.rslid_prefix + 
					   aurl.slice(sRSL_filters.thesis_rel_prefix.length + 
								  metadata.rslid.length + '/'.length);
				metadata.related_url.push({title: "Autoreferat RSL record", url: aurl});
			}
		}
		if (type == 'thesisAutoreferat') {
			// From citation point of view, the "manuscript" type might be more suitable
			// On the other hand, the thesis should be cited rather then this paper anyway.
			metadata.itemType = 'thesis';
			let turl = attr(doc, sRSL_filters.thesis_rel_css, sRSL_filters.thesis_rel_attr);
			if (turl) {
				turl = sRSL_filters.rslid_prefix + 
					   turl.slice(sRSL_filters.thesis_rel_prefix.length + 
								  metadata.rslid.length + '/'.length);
				metadata.related_url.push({title: "Thesis RSL record", url: turl});
			}
			metadata.extraType = type;
		}
		
		return metadata;
}


/**
 *	Parses record table with MARC data from aleph.rsl.ru. 
 *  Returned MARCXML string can be processed using the MARCXML import translator.
 *
 *	@return {String} - MARCXML record 
 */
function getMARCXML_aRSL(doc, url) {
	// -------------- Parse MARC table into a MARC array object -------------- //
	let marc_tags = doc.querySelectorAll(aRSL_filters.marc_table_tag_css);
	let marc_vals = doc.querySelectorAll(aRSL_filters.marc_table_val_css);
	let marc = [];
	
	if (marc_tags.length < 1) { return false; }
	
	// Leader
	marc.push([ marc_tags[1].innerText.padEnd(5, ' '), marc_vals[1].innerText]);

	for (let field_count = 2; field_count < marc_tags.length; field_count++) {
		let tag = marc_tags[field_count].innerText; 
		if (Number(tag)) {
			tag = tag.padEnd(5, ' ');
			marc.push([tag, marc_vals[field_count].innerText]);
		}
	}

	if (marc.length < 5) { return false; }

	// ---------- Format MARCXML from the prepared MARC array object --------- //  
	let irow = 0;
	let marcxml_lines = [];

	marcxml_lines.push(
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<record xmlns="http://www.loc.gov/MARC21/slim" type="Bibliographic">',
		'    <leader>' + marc[1][1] + '</leader>'
	);
	irow++;
	
	// Control fields
	for (irow; irow < marc.length; irow++) {
		let field_tag = marc[irow][0].slice(0, 3);
		let field_val = marc[irow][1];
		if (Number(field_tag) > 8) { break; }
		marcxml_lines.push(
			'    <controlfield tag="' + field_tag + '">' + field_val + '</controlfield>'
		);
	}
	
	// Data fields
	for (irow; irow < marc.length; irow++) {
		let field_tag = marc[irow][0].slice(0, 3);
		let field_ind = marc[irow][0].slice(3);
		let field_val = marc[irow][1];

		// Data field tag and indicators
		marcxml_lines.push('    <datafield tag="' + field_tag + 
									   '" ind1="' + field_ind[0] + 
									   '" ind2="' + field_ind[1] + '">');
		
		// Subfields
		let subfields = field_val.split('|');
		for (let isubfield = 1; isubfield < subfields.length; isubfield++) {
			// Split on first <space> character to extract the subfield code and its contents
			subfield = subfields[isubfield].replace(/\s/, '\x01').split('\x01');
			marcxml_lines.push(
				'        <subfield code="' + subfield[0] + '">' + subfield[1] + '</subfield>'
			);
		}
		
		marcxml_lines.push(
			'    </datafield>'
		);
	}

	marcxml_lines.push(
		'</record>'
	);
	
	return marcxml_lines.join('\n');
}


/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002457709",
		"items": [
			{
				"itemType": "book",
				"title": "Study of the ⁴He+²⁰⁹Bi fusion reaction",
				"creators": [
					{
						"firstName": "A. A.",
						"lastName": "Hassan",
						"creatorType": "editor"
					}
				],
				"date": "2003",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"callNumber": "FB 3 04-32/701",
				"extra": "RSLID: 01002457709\nBBK: В383.5,09",
				"language": "eng",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "11",
				"place": "Дубна",
				"publisher": "Объед. ин-т ядер. исслед",
				"series": "Объединенный ин-т ядерных исследований, Дубна",
				"seriesNumber": "E15-2003-186",
				"url": "https://search.rsl.ru/ru/record/01002457709",
				"attachments": [],
				"tags": [
					{
						"tag": "Физико-математические науки -- Физика -- Физика атомного ядра -- Ядерные реакции"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01007721928",
		"items": [
			{
				"itemType": "thesis",
				"title": "Химия неорганических молекулярных комплексов в газовой фазе: Автореф. дис. на соиск. учен. степени д-ра хим. наук: (02.00.07)",
				"creators": [
					{
						"firstName": "Андрей Владимирович",
						"lastName": "Суворов",
						"creatorType": "author"
					}
				],
				"date": "1977",
				"archive": "Авторефераты диссертаций",
				"callNumber": "FB Др 352/1727; FB Др 352/1728",
				"extra": "RSLID: 01007721928\nType: thesisAutoreferat\nBBK: Г116.625с16",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "32",
				"place": "Ленинград",
				"shortTitle": "Химия неорганических молекулярных комплексов в газовой фазе",
				"university": "б. и.",
				"url": "https://search.rsl.ru/ru/record/01007721928",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "Thesis RSL record",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01009512194",
		"items": [
			{
				"itemType": "thesis",
				"title": "Химия неорганических молекулярных комплексов в газовой фазе: диссертация ... доктора химических наук: 02.00.01",
				"creators": [
					{
						"firstName": "Андрей Владимирович",
						"lastName": "Суворов",
						"creatorType": "author"
					}
				],
				"date": "1977",
				"archive": "Диссертации",
				"callNumber": "OD Дд 78-2/85",
				"extra": "RSLID: 01009512194\nBBK: Г116.625с16,0; Г123.505-25,0",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "308",
				"place": "Ленинград",
				"shortTitle": "Химия неорганических молекулярных комплексов в газовой фазе",
				"url": "https://search.rsl.ru/ru/record/01009512194",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "Autoreferat RSL record",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [
					{
						"tag": "Неорганическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01000580022",
		"items": [
			{
				"itemType": "book",
				"title": "Труды Международной конференции \"Математика в индустрии\", 29 июня - 3 июля 1998 года",
				"creators": [],
				"date": "1998",
				"ISBN": "9785879761405",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"callNumber": "FB 2 98-27/128; FB 2 98-27/129",
				"extra": "RSLID: 01000580022\nBBK: Ж.с11я431(0)",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "352",
				"place": "Таганрог",
				"publisher": "Изд-во Таганрог. гос. пед. ин-та",
				"url": "https://search.rsl.ru/ru/record/01000580022",
				"attachments": [],
				"tags": [
					{
						"tag": "Техника и технические науки -- Применение математических методов -- Материалы конференции"
					}
				],
				"notes": [
					{
						"note": "В надзаг.: М-во общ. и проф. образования РФ. Таганрог. гос. пед. ин-т На обл. в подзаг.: ICIM - 98 Текст рус., англ Посвящается 300-летию основания г. Таганрога"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01004044482",
		"items": [
			{
				"itemType": "book",
				"title": "Химия. Неорганическая химия: учебник для 8 класса общеобразовательных учреждений",
				"creators": [
					{
						"firstName": "Гунтис Екабович",
						"lastName": "Рудзитис",
						"creatorType": "author"
					},
					{
						"firstName": "Фриц Генрихович",
						"lastName": "Фельдман",
						"creatorType": "author"
					}
				],
				"date": "2008",
				"ISBN": "9785090198592",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"callNumber": "FB 3 08-13/261",
				"edition": "12-е изд., испр",
				"extra": "RSLID: 01004044482\nBBK: Г1я721-1",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "175",
				"place": "Москва",
				"publisher": "Просвещение",
				"shortTitle": "Химия. Неорганическая химия",
				"url": "https://search.rsl.ru/ru/record/01004044482",
				"attachments": [],
				"tags": [
					{
						"tag": "Химические науки -- Общая и неорганическая химия -- Учебник для средней общеобразовательной школы"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01008704042",
		"items": [
			{
				"itemType": "thesis",
				"title": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом: автореферат дис. ... кандидата химических наук: [специальность] 02.00.01 Неорганическая химия",
				"creators": [
					{
						"firstName": "Хайриддин Гуломович",
						"lastName": "Мудинов",
						"creatorType": "author"
					}
				],
				"date": "2019",
				"archive": "Авторефераты диссертаций",
				"callNumber": "FB 2Р 43/502",
				"extra": "RSLID: 01008704042\nType: thesisAutoreferat",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "24",
				"place": "Душанбе",
				"shortTitle": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом",
				"url": "https://search.rsl.ru/ru/record/01008704042",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "E-resource",
						"snapshot": false,
						"contentType": "text/html"
					},
					{
						"linkMode": "linked_url",
						"title": "Thesis RSL record",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [
					{
						"tag": "Неорганическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01010006646",
		"items": [
			{
				"itemType": "thesis",
				"title": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом: диссертация ... кандидата химических наук: 02.00.01",
				"creators": [
					{
						"firstName": "Хайриддин Гуломович",
						"lastName": "Мудинов",
						"creatorType": "author"
					}
				],
				"date": "2019",
				"archive": "Диссертации",
				"callNumber": "OD 61 19-2/172",
				"extra": "RSLID: 01010006646",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "135",
				"place": "Душанбе",
				"shortTitle": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом",
				"url": "https://search.rsl.ru/ru/record/01010006646",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "E-resource",
						"snapshot": false,
						"contentType": "text/html"
					},
					{
						"linkMode": "linked_url",
						"title": "Autoreferat RSL record",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [
					{
						"tag": "Неорганическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01008942252",
		"items": [
			{
				"itemType": "report",
				"title": "Товары бытовой химии. Метод определения щелочных компонентов: Goods of household chemistry. Method for determination of alkaline components: государственный стандарт Российской Федерации: издание официальное: утвержден и введен в действие Постановлением Госстандарта России от 29 января 1997 г. № 26: введен впервые: введен 1998-01-01",
				"creators": [],
				"date": "1997",
				"archive": "Стандарты",
				"callNumber": "SVT ГОСТ Р 51021-97",
				"extra": "RSLID: 01008942252\nType: standard",
				"institution": "Изд-во стандартов",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"place": "Москва",
				"shortTitle": "Товары бытовой химии. Метод определения щелочных компонентов",
				"url": "https://search.rsl.ru/ru/record/01008942252",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "E-resource",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01007057068",
		"items": [
			{
				"itemType": "book",
				"title": "Химия и реставрация",
				"creators": [],
				"date": "1970",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"callNumber": "FB Бр 130/952; FB Бр 130/953; FB Арх",
				"extra": "RSLID: 01007057068",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "10",
				"place": "Москва",
				"publisher": "б. и.",
				"series": "Химия/ М-во культуры СССР",
				"seriesNumber": "70",
				"url": "https://search.rsl.ru/ru/record/01007057068",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01000681096",
		"items": [
			{
				"itemType": "book",
				"title": "Тезисы докладов Межрегиональной научной конференции \"Химия на пути в XXI век\", Ухта, 13-14 марта 2000 г",
				"creators": [],
				"date": "2000",
				"ISBN": "9785881792152",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"callNumber": "FB 2 00-8/1758-0; FB 2 00-8/1759-9",
				"extra": "RSLID: 01000681096\nBBK: Г.я431(2)",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "46",
				"place": "Ухта",
				"publisher": "Ухт. гос. техн. ун-т",
				"url": "https://search.rsl.ru/ru/record/01000681096",
				"attachments": [],
				"tags": [
					{
						"tag": "Химия -- Материалы конференции"
					}
				],
				"notes": [
					{
						"note": "В надзаг.: В надзаг.: М-во образования Рос. Федерации. Ухт. гос. техн. ун-т. Каф. химии"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002792532",
		"items": [
			{
				"itemType": "book",
				"title": "Физическая химия",
				"creators": [],
				"date": "2005",
				"ISBN": "9785812208066",
				"abstractNote": "Учебное пособие предназначено для студентов, аспирантов, научных и инженерно-технических работников, преподавателей ВУЗов и техникумов",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"callNumber": "FB 12 05-8/83",
				"extra": "RSLID: 01002792532\nBBK: Г5я732-1; Г6я732-1",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "282",
				"place": "М.",
				"publisher": "Моск. гос. ун-т печати",
				"url": "https://search.rsl.ru/ru/record/01002792532",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01004080147",
		"items": [
			{
				"itemType": "book",
				"title": "Физическая химия: учебное пособие",
				"creators": [
					{
						"firstName": "Константин Григорьевич",
						"lastName": "Боголицын",
						"creatorType": "editor"
					}
				],
				"date": "2008",
				"ISBN": "9785261003861",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"callNumber": "FB 3 08-25/12",
				"extra": "RSLID: 01004080147\nBBK: Г5я738-1",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "111",
				"place": "Архангельск",
				"publisher": "Архангельский гос. технический ун-т",
				"shortTitle": "Физическая химия",
				"url": "https://search.rsl.ru/ru/record/01004080147",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "E-resource",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [
					{
						"tag": "Химические науки -- Физическая химия. Химическая физика -- Учебник для высшей школы -- Заочное обучение"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002386114",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии",
				"creators": [
					{
						"lastName": "АН СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "РСФСР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "Российская академия наук",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "1930",
				"archive": "Сериальные издания (кроме газет)",
				"extra": "RSLID: 01002386114\nType: journal\nBBK: Г5я5",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"place": "Москва",
				"publisher": "Российская академия наук",
				"url": "https://search.rsl.ru/ru/record/01002386114",
				"attachments": [],
				"tags": [
					{
						"tag": "Химические науки -- Физическая химия. Химическая физика -- Общий раздел -- Периодические и продолжающиеся издания"
					}
				],
				"notes": [
					{
						"note": "Основан Бюро физ.-хим. конф. при НТУ ВСНХ СССР в 1930 г Журнал издается под руководством Отделения химии и наук о материалах РАН 1931-1934 (Т. 5 Вып. 1-3) является \"Серией В Химического журнала\" Изд-во: Т. 1 Гос. изд-во; Т. 2 Гос. науч.-техн. изд-во ; Т. 3-5 (Вып. 1-7) Гос. техн.-теорет. изд-во ; Т. 5 (Вып. 8-12) - 11 (Вып. 1-3) ОНТИ НКТП СССР; Т. 11 (Вып. 4-6) - 38 не указано; Т. 39-66 Наука ; Т. 67-72 МАИК \"Наука\"; Т. 73- Наука: МАИК \"Наука\"/Интерпериодика ; Т. 82- Наука Место изд.: 1930, т. 1, 29- М.; 1931. т. 2-28 М.; Л Изд-во: 2017- Федеральное государственное унитарное предприятие Академический научно-издательский, производственно-полиграфический и книгораспространительский центр \"Наука\" ; 2018- Российская академия наук"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/07000380351",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии",
				"creators": [
					{
						"lastName": "АН СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "РСФСР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "Российская академия наук",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "1930",
				"archive": "Сериальные издания (кроме газет)",
				"extra": "RSLID: 07000380351\nType: journal",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"place": "Москва",
				"publisher": "Российская академия наук",
				"url": "https://search.rsl.ru/ru/record/07000380351",
				"attachments": [],
				"tags": [],
				"notes": [
					{
						"note": "Основан Бюро физ.-хим. конф. при НТУ ВСНХ СССР в 1930 г Журнал издается под руководством Отделения химии и наук о материалах РАН 1931-1934 (Т. 5 Вып. 1-3) является \"Серией В Химического журнала\" Изд-во: Т. 1 Гос. изд-во; Т. 2 Гос. науч.-техн. изд-во; Т. 3-5 (Вып. 1-7) Гос. техн.-теорет. изд-во; Т. 5 (Вып. 8-12) - 11 (Вып. 1-3) ОНТИ НКТП СССР; Т. 11 (Вып. 4-6) - 38 не указано; Т. 39-66 Наука; Т. 67-72 МАИК \"Наука\"; Т. 73- Наука: МАИК \"Наука\"/Интерпериодика ; Т. 82- Наука Место изд.: 1930, т. 1, 29- М.; 1931. т. 2-28 М.; Л Изд-во: 2017- Федеральное государственное унитарное предприятие Академический научно-издательский, производственно-полиграфический и книгораспространительский центр \"Наука\" ; 2018- Российская академия наук"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01010153224",
		"items": [
			{
				"itemType": "report",
				"title": "Стабильные жидкие углеводороды. Определение ванадия, никеля, алюминия, мышьяка, меди, железа, натрия и свинца спектральными методами: стандарт организации: издание официальное: введен впервые: дата введения 2018-12-01",
				"creators": [
					{
						"lastName": "\"Газпром\", российское акционерное общество",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "2019",
				"archive": "Стандарты",
				"callNumber": "SVT СТО Газпром 5.78-2018",
				"extra": "RSLID: 01010153224\nType: standard\nBBK: Л54-101с344я861(2Р); Д453.1-43,0; И36-1я861",
				"institution": "Газпром экспо",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"place": "Санкт-Петербург",
				"shortTitle": "Стабильные жидкие углеводороды. Определение ванадия, никеля, алюминия, мышьяка, меди, железа, натрия и свинца спектральными методами",
				"url": "https://search.rsl.ru/ru/record/01010153224",
				"attachments": [],
				"tags": [
					{
						"tag": "Горное дело -- Разработка нефтяных и газовых месторождений -- Исследование -- Стандарты"
					},
					{
						"tag": "Науки о Земле -- Геологические науки -- Полезные ископаемые -- Горючие полезные ископаемые. Битумы -- Нефть -- Химический состав -- Стандарты"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01008033518",
		"items": [
			{
				"itemType": "report",
				"title": "ГОСТ IEC 61010-1-2014. Безопасность электрических контрольно-измерительных приборов и лабораторного оборудования =: Safety requirements for electrical equipment for measurement, control, and laboratory use. Part 1. General requirements: межгосударственный стандарт. Ч. 1: Общие требования",
				"creators": [
					{
						"lastName": "Межгосударственный совет по стандартизации, метрологии и сертификации",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "2015",
				"archive": "Стандарты",
				"callNumber": "SVT ГОСТ IEC 61010-1-2014",
				"extra": "RSLID: 01008033518\nType: standard",
				"institution": "Стандартинформ",
				"libraryCatalog": "Российская Государственная Библиотека",
				"place": "Москва",
				"shortTitle": "ГОСТ IEC 61010-1-2014. Безопасность электрических контрольно-измерительных приборов и лабораторного оборудования =",
				"url": "https://search.rsl.ru/ru/record/01008033518",
				"attachments": [],
				"tags": [
					{
						"tag": "аналитическая химия"
					},
					{
						"tag": "измерительные приборы"
					},
					{
						"tag": "лабораторное оборудование"
					},
					{
						"tag": "средства автоматизации и вычислительной техники"
					},
					{
						"tag": "техника безопасности"
					},
					{
						"tag": "химическая промышленность"
					},
					{
						"tag": "электрические и электронные испытания"
					}
				],
				"notes": [
					{
						"note": "Настоящий стандарт идентичен международному стандарту IEC 61010-1:2010 Safety requirements for electrical equipment for measurement, control, and laboratory use - Part 1: General requirements (Безопасность контрольно-измерительных приборов и лабораторного оборудования. Часть 1. Общие требования)"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01010285501",
		"items": [
			{
				"itemType": "book",
				"title": "Индия: путеводитель + карта: 12+",
				"creators": [
					{
						"firstName": "Дмитрий Евгеньевич",
						"lastName": "Кульков",
						"creatorType": "author"
					}
				],
				"date": "2020",
				"ISBN": "9785041079505",
				"archive": "Карты",
				"callNumber": "FB Гр Ч518; KGR Ко 169-20/IX-21",
				"edition": "2-е изд., испр. и доп.",
				"extra": "RSLID: 01010285501\nBBK: Я23(5Ид)",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "413",
				"place": "Москва",
				"publisher": "Эксмо, Бомбора™",
				"series": "Orangевый гид",
				"shortTitle": "Индия",
				"url": "https://search.rsl.ru/ru/record/01010285501",
				"attachments": [],
				"tags": [
					{
						"tag": "Литература универсального содержания -- Справочные издания -- Страноведческие справочники. Путеводители. Адресные книги. Адрес-календари -- Отдельные зарубежные страны -- Азия -- Индия"
					},
					{
						"tag": "Республика Индия, государство"
					}
				],
				"notes": [
					{
						"note": "Авт. указан перед вып. дан Указ. в конце кн"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01008937943",
		"items": [
			{
				"itemType": "thesis",
				"title": "Реакция Дильса-Альдера при деформации органических веществ под давлением: диссертация ... кандидата химических наук: 02.00.03",
				"creators": [
					{
						"firstName": "Валентин Сергеевич",
						"lastName": "Абрамов",
						"creatorType": "author"
					}
				],
				"date": "1980",
				"archive": "Диссертации",
				"callNumber": "OD Дк 81-2/93",
				"extra": "RSLID: 01008937943\nBBK: Г591,0; Г222.6Дл,0",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "118",
				"place": "Москва",
				"shortTitle": "Реакция Дильса-Альдера при деформации органических веществ под давлением",
				"url": "https://search.rsl.ru/ru/record/01008937943",
				"attachments": [],
				"tags": [
					{
						"tag": "Органическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01000287561",
		"items": [
			{
				"itemType": "thesis",
				"title": "Влияние природы кислотного катализатора на селективность и кинетические характеристики гидратации камфена и α-пинена: автореферат дис. ... кандидата химических наук: 02.00.04",
				"creators": [
					{
						"firstName": "Максим Васильевич",
						"lastName": "Куликов",
						"creatorType": "author"
					}
				],
				"date": "2000",
				"archive": "Авторефераты диссертаций",
				"callNumber": "FB 9 00-6/2084-8; FB 9 00-6/2085-6",
				"extra": "RSLID: 01000287561\nType: thesisAutoreferat\nBBK: Г221.76,0; Г292.3-271.6,0",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"numPages": "21",
				"place": "Нижний Новгород",
				"shortTitle": "Влияние природы кислотного катализатора на селективность и кинетические характеристики гидратации камфена и α-пинена",
				"url": "https://search.rsl.ru/ru/record/01000287561",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "E-resource",
						"snapshot": false,
						"contentType": "text/html"
					},
					{
						"linkMode": "linked_url",
						"title": "Thesis RSL record",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [
					{
						"tag": "Физическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002444380",
		"items": [
			{
				"itemType": "book",
				"title": "Основы общей химии: В 2 т.",
				"creators": [
					{
						"firstName": "Борис Владимирович",
						"lastName": "Некрасов",
						"creatorType": "author"
					}
				],
				"date": "2003",
				"ISBN": "9785811405008",
				"abstractNote": "Книга является первым томом двухтомной монографии, суммирующей основные особенности химии всех химических элементов. Монография предназначена для широкого круга научных работников, инженеров, студентов химических специальностей",
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"edition": "4. изд., стер",
				"extra": "RSLID: 01002444380\nBBK: Г1я731-1",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"place": "СПб. [и др.]",
				"publisher": "Лань",
				"shortTitle": "Основы общей химии",
				"url": "https://search.rsl.ru/ru/record/01002444380",
				"attachments": [],
				"tags": [
					{
						"tag": "Химические науки -- Общая и неорганическая химия -- Учебник для высшей школы"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002386114",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии",
				"creators": [
					{
						"lastName": "АН СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "РСФСР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "Российская академия наук",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "1930",
				"archive": "Сериальные издания (кроме газет)",
				"extra": "RSLID: 01002386114\nType: journal\nBBK: Г5я5",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"place": "Москва",
				"publisher": "Российская академия наук",
				"url": "https://search.rsl.ru/ru/record/01002386114",
				"attachments": [],
				"tags": [
					{
						"tag": "Химические науки -- Физическая химия. Химическая физика -- Общий раздел -- Периодические и продолжающиеся издания"
					}
				],
				"notes": [
					{
						"note": "Основан Бюро физ.-хим. конф. при НТУ ВСНХ СССР в 1930 г Журнал издается под руководством Отделения химии и наук о материалах РАН 1931-1934 (Т. 5 Вып. 1-3) является \"Серией В Химического журнала\" Изд-во: Т. 1 Гос. изд-во; Т. 2 Гос. науч.-техн. изд-во ; Т. 3-5 (Вып. 1-7) Гос. техн.-теорет. изд-во ; Т. 5 (Вып. 8-12) - 11 (Вып. 1-3) ОНТИ НКТП СССР; Т. 11 (Вып. 4-6) - 38 не указано; Т. 39-66 Наука ; Т. 67-72 МАИК \"Наука\"; Т. 73- Наука: МАИК \"Наука\"/Интерпериодика ; Т. 82- Наука Место изд.: 1930, т. 1, 29- М.; 1931. т. 2-28 М.; Л Изд-во: 2017- Федеральное государственное унитарное предприятие Академический научно-издательский, производственно-полиграфический и книгораспространительский центр \"Наука\" ; 2018- Российская академия наук"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/07000380352",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии. 2019",
				"creators": [],
				"archive": "Книги (изданные с 1831 г. по настоящее время)",
				"extra": "RSLID: 07000380352",
				"language": "rus",
				"libraryCatalog": "Российская Государственная Библиотека",
				"url": "https://search.rsl.ru/ru/record/07000380352",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://aleph.rsl.ru/F/RHHCIAN6HNXCK6MBTHQTH8JPT2T8LG3T6VPTVBKAUXEA8HITMK-01986?func=full-set-set&set_number=001478&set_entry=000001&format=001",
		"items": [
			{
				"itemType": "book",
				"title": "Однообразно и уныло: часть VIII из романа в стихах «Роман девушки»: стихотворение: [список]",
				"creators": [
					{
						"firstName": "Евдокия Петровна",
						"lastName": "Ростопчина",
						"creatorType": "author"
					}
				],
				"extra": "RSLID: 01010089849",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "1",
				"place": "Б. м.",
				"series": "Коллекция Я. П. Гарелина",
				"shortTitle": "Однообразно и уныло",
				"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=001478&set_entry=000001&format=999",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "search.rsl.ru",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Сохранность: края листа надорваны; реставрирован в 1950 г Надписи, записи, пометы: поправки и надпись-автограф (французский яз.)"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=001478&set_entry=000001&format=037",
		"items": [
			{
				"itemType": "book",
				"title": "Однообразно и уныло: часть VIII из романа в стихах «Роман девушки»: стихотворение: [список]",
				"creators": [
					{
						"firstName": "Евдокия Петровна",
						"lastName": "Ростопчина",
						"creatorType": "author"
					}
				],
				"extra": "RSLID: 01010089849",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "1",
				"place": "Б. м.",
				"series": "Коллекция Я. П. Гарелина",
				"shortTitle": "Однообразно и уныло",
				"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=001478&set_entry=000001&format=999",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "search.rsl.ru",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Сохранность: края листа надорваны; реставрирован в 1950 г Надписи, записи, пометы: поправки и надпись-автограф (французский яз.)"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://aleph.rsl.ru/F/9F63N9XQHXHST5RUEVM27SY4THNCJSYLXPI53E2V7GDDRMNUUJ-02384?func=full-set-set&set_number=001478&set_entry=000001&format=002",
		"items": [
			{
				"itemType": "book",
				"title": "Однообразно и уныло: часть VIII из романа в стихах «Роман девушки»: стихотворение: [список]",
				"creators": [
					{
						"firstName": "Евдокия Петровна",
						"lastName": "Ростопчина",
						"creatorType": "author"
					}
				],
				"extra": "RSLID: 01010089849",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "1",
				"place": "Б. м.",
				"series": "Коллекция Я. П. Гарелина",
				"shortTitle": "Однообразно и уныло",
				"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=001478&set_entry=000001&format=999",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "search.rsl.ru",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Сохранность: края листа надорваны; реставрирован в 1950 г Надписи, записи, пометы: поправки и надпись-автограф (французский яз.)"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=005075&set_entry=000010&format=001",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии",
				"creators": [
					{
						"lastName": "АН СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "РСФСР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "Российская академия наук",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "1930",
				"callNumber": "Г5я5",
				"extra": "RSLID: 01002386114",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"place": "Москва",
				"publisher": "Российская академия наук",
				"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=005075&set_entry=000010&format=999",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "search.rsl.ru",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Основан Бюро физ.-хим. конф. при НТУ ВСНХ СССР в 1930 г Журнал издается под руководством Отделения химии и наук о материалах РАН 1931-1934 (Т. 5 Вып. 1-3) является \"Серией В Химического журнала\" Изд-во: Т. 1 Гос. изд-во; Т. 2 Гос. науч.-техн. изд-во ; Т. 3-5 (Вып. 1-7) Гос. техн.-теорет. изд-во ; Т. 5 (Вып. 8-12) - 11 (Вып. 1-3) ОНТИ НКТП СССР; Т. 11 (Вып. 4-6) - 38 не указано; Т. 39-66 Наука ; Т. 67-72 МАИК \"Наука\"; Т. 73- Наука: МАИК \"Наука\"/Интерпериодика ; Т. 82- Наука Место изд.: 1930, т. 1, 29- М.; 1931. т. 2-28 М.; Л Изд-во: 2017- Федеральное государственное унитарное предприятие Академический научно-издательский, производственно-полиграфический и книгораспространительский центр \"Наука\" ; 2018- Российская академия наук"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=005075&set_entry=000002&format=001",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии. 2019",
				"creators": [],
				"extra": "RSLID: 01009918533",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"url": "http://aleph.rsl.ru/F/?func=full-set-set&set_number=005075&set_entry=000002&format=999",
				"attachments": [
					{
						"linkMode": "linked_url",
						"title": "search.rsl.ru",
						"snapshot": false,
						"contentType": "text/html"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
