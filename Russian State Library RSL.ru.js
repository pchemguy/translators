{
	"translatorID": "26ce1cb2-07ec-4d0e-9975-ce2ab35c8343",
	"label": "a a Russian State Library RSL.ru",
	"creator": "PChemGuy",
	"target": "^https://search\\.rsl\\.ru/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-04-08 10:13:15"
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


function attr(docOrElem, selector, attr, index) {
	var elem = index ? docOrElem.querySelectorAll(selector).item(index) : docOrElem.querySelector(selector);
	return elem ? elem.getAttribute(attr) : null;
}


function text(docOrElem, selector, index) {
	var elem = index ? docOrElem.querySelectorAll(selector).item(index) : docOrElem.querySelector(selector);
	return elem ? elem.textContent : null;
}


function detectWeb(doc, url) {
	// Zotero.debug(url);
	
	if (url.indexOf("/search#q=") != -1) {
		return "multiple";
	} else if (url.indexOf("/record/") != -1) {
		return "book";
	}
	return false;
}


function doWeb(doc, url) {
	if (detectWeb(doc, url) == "multiple") {
		Zotero.selectItems(getSearchResults(doc, false),
						function (items) {
							if (items) ZU.processDocuments(Object.keys(items), scrape);
						}
		);
	}
	else {
		scrape(doc, url);
	}
}


function scrape(doc, url) {
	// Convert HTML table of MARC record to MARCXML
	let record_marcxml = getMARCXML(doc, url);
	
	// call MARCXML translator
	var trans = Zotero.loadTranslator('import');
	trans.setTranslator('32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7'); //RIS
	trans.setString(record_marcxml);
	trans.setHandler('itemDone', scrape_callback(doc, url));
	trans.translate();
}


function scrape_callback(doc, url) {
	function callback(obj, item) {
		Zotero.debug("item");
		item.complete();
	}
	return callback;
}

/*
function(obj, item) {
	// scrape abstract from page
	item.abstractNote = ZU.trimInternal(cleanMath(
		ZU.xpathText(doc, '//section[contains(@class,"abstract")]/div[@class="content"]/p[1]')
	));
	
	// attach PDF
	if (ZU.xpath(doc, '//div[@class="article-nav-actions"]/a[contains(text(), "PDF")]').length) {
		item.attachments.push({
			title: 'Full Text PDF',
			url: url.replace('{REPLACE}', 'pdf'),
			mimeType: 'application/pdf'
		});
	}
	
	item.attachments.push({
		title: "APS Snapshot",
		document: doc
	});
	
	if (Z.getHiddenPref && Z.getHiddenPref('attachSupplementary')) {
		ZU.processDocuments(url.replace('{REPLACE}', 'supplemental'), function(doc) {
			try {
				var asLink = Z.getHiddenPref('supplementaryAsLink');
				var suppFiles = doc.getElementsByClassName('supplemental-file');
				for (var i=0; i<suppFiles.length; i++) {
					var link = suppFiles[i].getElementsByTagName('a')[0];
					if (!link || !link.href) continue;
					var title = link.getAttribute('data-id') || 'Supplementary Data';
					var type = suppTypeMap[link.href.split('.').pop()];
					if (asLink || dontDownload.indexOf(type) != -1) {
						item.attachments.push({
							title: title,
							url: link.href,
							mimeType: type || 'text/html',
							snapshot: false
						});
					} else {
						item.attachments.push({
							title: title,
							url: link.href,
							mimeType: type
						});
					}
				}
			} catch (e) {
				Z.debug('Could not attach supplemental data');
				Z.debug(e);
			}
		}, function() { item.complete() });
	} else {
		item.complete();
	}
}
*/


function getSearchResults(doc, checkOnly) {
	var items = {};
	var found = false;
	// TODO: adjust the CSS selector
	var rows = doc.querySelectorAll('h2>a.title[href*="/article/"]');
	for (let row of rows) {
		// TODO: check and maybe adjust
		let href = row.href;
		// TODO: check and maybe adjust
		let title = ZU.trimInternal(row.textContent);
		if (!href || !title) continue;
		if (checkOnly) return true;
		found = true;
		items[href] = title;
	}
	return found ? items : false;
}


function getMARCXML(doc, url) {
	// var marc_rows = doc.querySelectorAll('div#marc-rec > table > tbody > tr'); 
	// Zotero.debug(text(marc_rows[0], 'td', 1));

	const marc_table_div_selector = 'div#marc-rec > table';
	let irow = 0;

	let marc21_table_rows = doc.querySelector(marc_table_div_selector).rows;
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
		if (Number(field_tag) > 8) { break; }
		let field_val = cur_cells[1].innerText;
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
		cur_cells[1].innerHTML = cur_cells[1].innerHTML.replace(/>\$/g, '>$$$$$$');
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
