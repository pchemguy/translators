{
	"translatorID": "71a95c3d-e730-4fd9-83c3-faf7e0576346",
	"label": "CNTDF",
	"creator": "PChemGuy",
	"target": "https?://docs.cntd.ru/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsbv",
	"lastUpdated": "2020-04-24 23:39:02"
}

/**
	***** BEGIN LICENSE BLOCK *****

	Copyright В© 2020 PChemGuy

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

/**
	A provider of legislative, technical, and regulatory documents in Russian.
	With primary focus on documents produced by Russian authorities, CNTD also
	serves translated into Russian foreign and international documents applicable
	to activities in Russia.

	Search interface:
		http://docs.cntd.ru/search/intellectual/q/<QUERY>
*/

const filters = {
	metadataTableCSS: "div#tab-content2-low > div.document > table.status",
	pdfKeyScriptCSS: "div#page-wrapper > script:nth-child(2)",
	searchResultCSS: "div#tab-content-search > div.content > ul > li > a"
};

const keywords = {
	activeLaw: "Действующий",
	codeAmendments: "(с изменениями на",
	codeVersion: "(редакция"
};

let waitStep;
let waitCount;
const pdfStatus = {
	started: -1,
	inprocess: -1,
	ready: 1,
};

// Tracks completion of independent GET/POST requests 
let branchesCompleted;

// Holds extracted metadata
let metadata;
let metahtml;

let fieldMap = {
	"Название документа": "title",
	"Номер документа": "publicDocNumber",
	"Вид документа": "docType",
	"Принявший орган": "authority",
	Статус: "legalStatus",
	Опубликован: "published",
	"Дата принятия": "dateApproved",
	"Дата начала действия": "dateEnacted",
	"Дата редакции": "dateAmended",
	"Дата окончания действия": "dateRevoked"
};

// Inverted fieldMap mapping object
let fieldMapRev = Object.assign({}, ...Object.entries(fieldMap).map(([a, b]) => ({ [b]: a })));

/**
	Custom document types
	Each custom type consists of:
		key:		user facing original type name
		"type": 	specific subtype that could be used for coding purposes
		"itemType": zotero item type
		"short":	user facing shortened type name
		"abbr":		user facing type name abbreviation
		"tags":		tags to be added
*/
const docTypes = {
	ГОСТ: { type: "standard", itemType: "report", short: "ГОСТ", abbr: "ГОСТ", tags: ['standard', 'GOST'] },
	"ГОСТ Р": { type: "standard", itemType: "report", short: "ГОСТ Р", abbr: "ГОСТ Р", tags: ['standard', 'GOST'] },
	"Кодекс РФ": { type: "code", itemType: "statute", short: "Кодекс РФ", abbr: "Кодекс РФ", tags: ['RF Code'] },
	РБ: { type: "statute", itemType: "statute", short: "Руководство по безопасности", abbr: "РБ" },
	"ГН (Гигиенические нормативы)": { type: "statute", itemType: "statute", short: "Гигиенические нормативы", abbr: "ГН" },
	"ФНП (Федеральные нормы и правила)": { type: "statute", itemType: "statute", short: "Федеральные нормы и правила", abbr: "ФНП" },
	"СП (Санитарные правила)": { type: "statute", itemType: "statute", short: "Санитарные правила", abbr: "СП" },
	СанПиН: { type: "statute", itemType: "statute", short: "Санитарные правила и нормы", abbr: "СанПиН" },
	СНиП: { type: "statute", itemType: "statute", short: "Строительные нормы и правила", abbr: "СНиП" },
	"СП (Свод правил)": { type: "statute", itemType: "statute", short: "Свод правил", abbr: "СП" },
	"Информационно-технический справочник по наилучшим доступным технологиям":
		{ type: "statute", itemType: "statute", short: "Информационно-технический справочник по наилучшим доступным технологиям", abbr: "ИТС" },
	"ПОТ РМ": { type: "statute", itemType: "statute", short: "ПОТ РМ", abbr: "ПОТ РМ" },
	ПБ: { type: "statute", itemType: "statute", short: "Правила безопасности", abbr: "ПОТ РМ" },
	"СТО, Стандарт организации": { type: "statute", itemType: "statute", short: "Стандарт организации", abbr: "СТО" },
	"ТР (Технический регламент)": { type: "statute", itemType: "statute", short: "Технический регламент", abbr: "ТР" },
	"Технический регламент Таможенного союза":
		{ type: "statute", itemType: "statute", short: "Технический регламент Таможенного союза", abbr: "ТР ТС" },
	"Технический регламент Евразийского экономического союза":
		{ type: "statute", itemType: "statute", short: "Технический регламент Евразийского экономического союза", abbr: "ТР ЕАЭС" },
	"Государственная поверочная схема": { type: "statute", itemType: "statute",
		short: "Государственная поверочная схема", abbr: "ГПС" },
	Изменение: { type: "statute", itemType: "statute", short: "Изменение", abbr: "Изменение" },
	"МР (Методические рекомендации)": { type: "statute", itemType: "statute", short: "Методические рекомендации", abbr: "МР" },
	"Инструкция по промышленной безопасности и охране труда":
		{ type: "statute", itemType: "statute", short: "ИПБОТ", abbr: "ИПБОТ" },
	Statute: { type: "statute", itemType: "statute", short: "Statute", abbr: "statute" }
};

const legalTypes = ["Указ", "Приказ", "Постановление", "Распоряжение"];

/**
	There are records with no document type defined. When such a type can be
	defined based on document title, an array element is added here, which is an
	arrayed pair of "pattern" to be matched against the title and "custom type".
	Additionally, a corresponding descriptor is added to "docTypes".
*/
const docTypePatterns = [
	[/^Государственная поверочная схема для/, "Государственная поверочная схема"],
	[/^Методические рекомендации /, "МР (Методические рекомендации)"],
	[/^ИПБОТ /, "Инструкция по промышленной безопасности и охране труда"]
];

// Use this to match against document type field (for multi-valued types)
const matchTypePattern = [
	[/Технический регламент Таможенного союза/, "Технический регламент Таможенного союза"],
	[/Технический регламент/, "ТР (Технический регламент)"],
	[/СанПиН/, "СанПиН"],
	[/СНиП/, "СНиП"],
	[/ГН/, "ГН (Гигиенические нормативы)"],
	[/СП \(Свод правил\)/, "СП (Свод правил)"],
	[/СП \(Санитарные правила\)/, "СП (Санитарные правила)"],
	[/ФНП в области /, "ФНП (Федеральные нормы и правила)"],
	[/ПБ/, "ПБ"],
	[/ПОТ РМ/, "ПОТ РМ"]
];


/**
 *	Adds link attachment to a Zotero item.
 *
 *	@param {Object} item - Zotero item
 *	@param {String} title - Link name
 *	@param {String} url - Link url
 *
 *	@return {None}
 */
/**
function addLink(item, title, url) {
	item.attachments.push({ linkMode: "linked_url", // Apparently, should be the first
		title: title,
		snapshot: false,
		contentType: "text/html",
		url: url });
}
*/

function detectWeb(doc, url) {
	let pathname = doc.location.pathname;
	let searchPattern = '/search/';
	let recordPattern = /^\/document\/([0-9]+)/;

	if (pathname.includes(searchPattern)) {
		return 'multiple';
	}

	if (pathname.match(recordPattern)) {
		parseMetadata(doc);
		getType();
		metadata.CNTDID = pathname.match(recordPattern)[1];
		return metadata.itemType;
	}

	return false;
}


function doWeb(doc, url) {
	let detected = detectWeb(doc, url);
	if (detected == 'multiple') {
		let searchResult = getSearchResult(doc, url);
		if (searchResult) {
			Zotero.selectItems(searchResult,
				function (selectedRecords) {
					if (selectedRecords) {
						ZU.processDocuments(Object.keys(selectedRecords), doWeb);
					}
				}
			);
		}
	} else {
		adjustMetadata(doc);
		dispatch(doc, url);
	}
}


function getSearchResult(doc, _url) {
	let records = {};
	let searchResult = doc.querySelectorAll(filters.searchResultCSS);
	searchResult.forEach(record => records[record.href] = record.innerText.trim());
	return records;
}


// Dispatches independent asynchronous requests
function dispatch(doc, url) {
	branchesCompleted = {
		CNTD: false,
		Garant: false,
		Consultant: true
	};

	CNTD(doc, url);
	Garant(doc, url);
}


function gateKeeper(doc, url) {
	if (branchesCompleted.CNTD && branchesCompleted.Garant && branchesCompleted.Consultant) {
		populateItem(doc, url);
	}
}


/**
 * Checks whether full text pdf is available. If available, sends a POST request,
 * and waits for the "ready" status. Then calls routine constructing Zotero item.
 * In case of a time out or no pdf, "Zotero item" routine is called.
 */
function CNTD(doc, url) {
	waitStep = 3000;
	waitCount = 40;

	if (metadata.pdfKey) {
		// Z.debug('Requesting pdf id: ' + metadata.CNTDID + ' key: ' + metadata.pdfKey)
		Z.debug('Requesting pdf id: ' + metadata.CNTDID);
		let postUrl = 'http://docs.cntd.ru/pdf/get/';
		let postData = 'id=' + metadata.CNTDID + '&key=' + metadata.pdfKey + '&hdaccess=false';
		ZU.doPost(postUrl, postData, waitforPDF);
	} else {
		// Full text N/A (not provided)
		Z.debug('PDF is not provided...');
		branchesCompleted.CNTD = true;
		gateKeeper(doc, url);
		//scrapeMetadata(doc, url);
		return;
	}
	
	// Waits for the PDF "ready" status by pinging the server using GET requests
	function waitforPDF(responseText, xmlhttp) {
		if (responseText) {
			Z.debug('PDF request (POST) response: ' + responseText);
			let status = responseText.match(/{"status":"([a-z]+)/);
			if (status) status = pdfStatus[status[1]];
			if (!status) {
				// Full text N/A (bad response)
				Z.debug('PDF is not available - bad response... (waitforPDF)');
				branchesCompleted.CNTD = true;
				gateKeeper(doc, url);
				//scrapeMetadata(doc, url);
				return;
			}
		}

		let getURL = 'http://docs.cntd.ru/pdf/get/?id='
			+ metadata.CNTDID + '&key=' + metadata.pdfKey + '&hdaccess=false';
		ZU.doGet(getURL, checkforPDF);
	}

	// Checks server response. If PDF is not ready and the maximum retry count is
	// not reached, keep waiting. Otherwise, call metadata routine.
	function checkforPDF(responseText, xmlhttp, requestURL) {
		let status = responseText.match(/{"status":"([a-z]+)/);
		if (status) status = pdfStatus[status[1]];

		switch (status) {
			case -1:
				waitCount--;
				if (waitCount <= 0) {
					// Full text N/A (request time out)
					Z.debug('PDF request timed out...');
					branchesCompleted.CNTD = true;
					gateKeeper(doc, url);
					//scrapeMetadata(doc, url);
				} else {
					Z.debug('Waiting for pdf ready status: ' + responseText);
					ZU.setTimeout(waitforPDF, waitStep, '', {});
				}
				break;
			case 1:
				// Full text ready
				Z.debug('PDF is ready. Response :' + responseText);
				metadata.pdfAvailable = true;
				branchesCompleted.CNTD = true;
				gateKeeper(doc, url);
				//scrapeMetadata(doc, url);
				break;
			default:
				// Full text N/A (bad response)
				Z.debug('PDF is not available - bad response: ' + responseText);
				branchesCompleted.CNTD = true;
				gateKeeper(doc, url);
				//scrapeMetadata(doc, url);
		}
	}
}


function Garant(doc, url) {
	branchesCompleted.Garant = true;
	gateKeeper(doc, url);
}


// Constructs Zotero item and populates it
function populateItem(doc, url) {
	let extra = [];
	let zItem = new Zotero.Item(metadata.itemType);
	metadata.zItem = zItem;
	// creator: {fieldMode: 1, firstName: "", lastName: "", creatorType: "author"};
	let authorities = metadata.authority.split(' ## ');
	for (let authority of authorities) {
		zItem.creators.push({
			fieldMode: 1,
			firstName: "",
			lastName: authority,
			creatorType: "author"
		});
	}

	zItem.title = metadata.title;
	zItem.url = url;
	zItem.language = 'Russian';

	// For statute, the date/dateEnacted field is set to the last amendment
	// date. Original enactment date is stored in the extra field.
	zItem.date = metadata.dateAmended ? metadata.dateAmended : metadata.dateEnacted;

	switch (metadata.itemType) {
		case 'statute':
			zItem.codeNumber = metadata.subType;
			zItem.publicLawNumber = metadata.publicDocNumber;
			if (metadata.code) zItem.code = metadata.code;
			if (metadata.section) zItem.section = metadata.section;
			break;
		case 'report':
			zItem.reportType = metadata.subType;
			zItem.reportNumber = metadata.publicDocNumber;
			break;
	}

	switch (metadata.subType) {
		case 'Кодекс РФ':
		case 'ФНП (Федеральные нормы и правила)':
			zItem.codeNumber = metadata.docType;
			break;
	}

	// Extra
	extra.push('CNTDID: ' + metadata.CNTDID);
	if (metadata.published) extra.push('Published: ' + metadata.published);
	extra.push('dateEnactedOriginal: ' + metadata.dateEnacted);
	if (metadata.dateApproved) extra.push('dateApproved: ' + metadata.dateApproved);
	if (metadata.dateRevoked) extra.push('dateRevoked: ' + metadata.dateRevoked);
	zItem.extra = extra.join('\n');

	if (metadata.tags) zItem.tags.push(...metadata.tags);
	if (metadata.legalStatus && metadata.legalStatus != keywords.activeLaw) zItem.tags.push('Inactive');
	if (metadata.dateRevoked) zItem.tags.push('Revoked');

	if (metadata.notes) {
		metadata.notes.forEach(note => zItem.notes.push(note));
	}

	if (metadata.pdfAvailable) {
		zItem.attachments.push({
			title: "Full Text PDF",
			url: metadata.pdfURL,
			mimeType: "application/pdf"
		});
	}

	zItem.complete();
	Z.debug('zItem is complete...');
}


/**
 *	Parses record table with document metadata into global metadata object
 *
 *	@return {null}
 */
function parseMetadata(doc) {
	let irow;
	let descTable = doc.querySelector(filters.metadataTableCSS);
	let descTableRows = descTable.rows;
	let srcJSON = {};
	metadata = {};
	metahtml = {};
	metadata.notes = [];

	// Parse description table
	for (irow = 0; irow < descTableRows.length; irow++) {
		let rowCells = descTableRows[irow].cells;
		if (rowCells.length == 0) continue;
		let fieldNameRaw = rowCells[0].innerText.trim().slice(0, -1);
		let fieldName = fieldMap[fieldNameRaw];
		srcJSON[fieldNameRaw] = rowCells[1].innerText.trim();
		metadata[fieldName] = srcJSON[fieldNameRaw];
		metahtml[fieldName] = rowCells[1].innerHTML;
	}

	srcJSON["Название документа"] = metahtml.title.replace(/(<br>)+/g, '\n').trim();
	if (metahtml.publicDocNumber) {
		srcJSON["Номер документа"] = metahtml.publicDocNumber.replace(/(<br>)+/g, '\n').trim();
	}
	let srcText = JSON.stringify(srcJSON)
		.replace(/ *(\\t)+/g, '\n')
		.replace(/ *(\\n)+/g, '\n')
		.replace(/ *(\n)+/g, '\n');
	metadata.notes.push(srcText);

	let tableHTML = descTable.outerHTML.trim();
	let indent = '    ';
	tableHTML = tableHTML
		.replace(/\n+/g, '<br>')
		.replace(/(\s*<br>\s*)+/g, '<br>')
		.replace(/><br>/g, '>')
		.replace(/\s+<tbody>/, '<tbody>')
		.replace(/\s*<(|\/)tr>/g, '\n' + indent + '<$1tr>')
		.replace(/\s*(<td[^>]*>)\s*/g, '\n' + indent + indent + '$1')
		.replace(/\s*<\/td>/g, '</td>')
		.replace(/<tr>\s*<\/tr>/g, '')
		.replace(/\s*<\/tbody>/, '\n</tbody>')
		.replace(/(:|(<br>)*)<\/td>/g, '</td>');
	metadata.notes.push(tableHTML);
}


function getType() {
	let subType;
	let title = metadata.title;
	// Try to deduce type from the multi-valued type field
	if (metadata.docType) {
		let docType = metadata.docType;
		for (let pattern of matchTypePattern) {
			if (docType.match(pattern[0])) {
				subType = pattern[1];
				break;
			}
		}
		if (subType) {
			switch (subType) {
				case 'ТР (Технический регламент)':
					if (title.startsWith('ТР ЕАЭС')) subType = 'Технический регламент Евразийского экономического союза';
					break;
			}
			metadata.subType = subType;
		}
	}

	// Try to deduce type from the title
	if (!metadata.docType) {
		for (let pattern of docTypePatterns) {
			if (title.match(pattern[0])) {
				metadata.docType = pattern[1];
				break;
			}
		}
	}

	if (!metadata.docType) metadata.docType = 'Statute';
	metadata.type = 'statute';
	metadata.itemType = 'statute';

	// Set subType from docType if not set.
	if (!metadata.subType) {
		subType = metadata.docType.match(/^[^\n]+/)[0].trim(); // For RF Codes (1st line)
		metadata.subType = subType;
	}
	let subT = docTypes[subType];
	if (subT) {
		metadata.type = subT.type;
		metadata.itemType = subT.itemType;
	}
}


/**
 *	Adjust metadata
 *
 *	@return {null}
 */
function adjustMetadata(doc) {
	let subType = metadata.subType;
	let subT = docTypes[subType];

	/**
		Document ID, title, type, and authority may have multiple values separated
		by several new lines. Replace separator with " ## ".
		There are issues with missing "\n" (innerText) in place of <br> (innerHTML)
		possibly due to the "doc" format passed by the tester, hence the extra code.
	*/
	metadata.title = metahtml.title.replace(/<br>/g, '\n').trim().replace(/[\n]+/g, ' ## ');
	if (metadata.publicDocNumber) {
		metadata.publicDocNumber = metahtml.publicDocNumber
			.replace(/<br>/g, '\n').trim().replace(/[\n]+/g, ' ## ');
	}
	if (metadata.authority) metadata.authority = metadata.authority.replace(/[\t\n]+/g, ' ## ');

	/**
		Remove document type and number prefix from title
		This general processing must go before the next block, in which additional
		type-specific processing may be performed.
	*/
	let prefixPatterns = [];
	prefixPatterns.push(subType + ' ' + metadata.publicDocNumber + ' ');
	prefixPatterns.push(metadata.publicDocNumber + ' ' + subType + ' ');
	if (subT) prefixPatterns.push(subT.abbr + ' ' + metadata.publicDocNumber + ' ');
	let title = metadata.title;
	for (let prefix of prefixPatterns) {
		if (title.startsWith(prefix)) {
			metadata.title = title.slice(prefix.length);
			break;
		}
	}

	if (subT) {
		let docNumber;
		let docType;
		let section;
		let docSubNumber;
		let title;
		let prefix;
		let codeTitle;
		let icutoff;
		let pattern;
		let dateApproved;

		switch (subType) {
			case 'Кодекс РФ':
				// Set docType to the second line ("Federal law")
				metadata.docType = metadata.docType.match(/^[^\n]+[\n\t]+([^\n]+)/)[1].trim();
				codeTitle = metadata.title;
				icutoff = codeTitle.indexOf(keywords.codeAmendments);
				if (icutoff == -1) icutoff = codeTitle.indexOf(keywords.codeVersion);
				metadata.code = codeTitle.slice(0, icutoff).trim();
				break;
			case 'РБ':
				// Remove document type and number prefix from title
				metadata.title = metadata.title.replace(subType + '-' + metadata.publicDocNumber + ' ', '');
				title = metadata.title;
				pattern = RegExp('^' + subT.short + ' "([^"]+)"$');
				title = title.match(pattern);
				if (title) metadata.title = title[1];
				break;
			case 'ПОТ РМ':
				prefix = metadata.title.match(/^ПОТ Р ?М-([0-9./-]+) /);
				if (prefix) {
					metadata.title = metadata.title.slice(prefix[0].length);
					docNumber = prefix[1];
					docSubNumber = metadata.publicDocNumber
						.replace(' ## ' + docNumber, '').replace(docNumber + ' ## ', '').replace(docNumber, '');
					if (docSubNumber) metadata.publicDocNumber = docNumber + ' ## ' + docSubNumber;
				}
				break;
			case 'ПБ':
				title = metadata.title;
				prefix = 'Об утверждении Правил ';
				if (title.startsWith(prefix)) {
					title = title.replace('Об утверждении Правил ', 'Правила ');
				} else {
					prefix = metadata.title.match(/^ПБ ([0-9.-]+) /);
					if (prefix) {
						let docNumber = prefix[1];
						if (metadata.publicDocNumber.includes(docNumber)) {
							title = title.slice(prefix[0].length);
							let docSubNumber = metadata.publicDocNumber
								.replace(' ## ' + docNumber, '').replace(docNumber + ' ## ', '').replace(docNumber, '');
							if (docSubNumber) metadata.publicDocNumber = docNumber + ' ## ' + docSubNumber;
						}
					}
				}
				metadata.title = title;
				break;
			case 'СТО, Стандарт организации':
				title = metadata.title;
				prefix = subT.abbr + ' ([^0-9]+) ' + metadata.publicDocNumber + ' ';
				prefix = title.match(prefix);
				if (prefix) {
					metadata.title = title.replace(prefix[0], '');
					if (!metadata.authority) metadata.authority = prefix[1];
					else metadata.section = prefix[1];
				}
				break;
			case 'ГН (Гигиенические нормативы)':
			case 'СанПиН':
			case 'СП (Санитарные правила)':
				if (!metadata.publicDocNumber) break;
				docNumber = metadata.title.slice(subT.abbr.length + 1).match(/^[^\s]+/);
				if (docNumber) {
					docNumber = metadata.publicDocNumber.match(docNumber[0]);
				}
				if (docNumber) {
					docNumber = docNumber[0];
					metadata.title = metadata.title.replace(subT.abbr + ' ' + docNumber + ' ', '');
					docSubNumber = metadata.publicDocNumber
						.replace(' ## ' + docNumber, '').replace(docNumber + ' ## ', '').replace(docNumber, '');
					if (docSubNumber) metadata.publicDocNumber = docNumber + ' ## ' + docSubNumber;
				}
				if (subType[0] == 'С') metadata.code = 'СП (Санитарные правила)';
				break;
			case 'СНиП':
				dateApproved = metadata.dateApproved;
				dateApproved = dateApproved.replace('*', '');
				dateApproved = dateApproved.replace(/\n.*/, '').trim();
				metadata.dateApproved = dateApproved;
				title = metadata.title;
				title = title.replace('*', '');
				prefix = title.match(/^СНиП ([0-9.\-/]+) /);
				if (prefix) {
					title = title.slice(prefix[0].length);
					docNumber = prefix[1];
					docSubNumber = metadata.publicDocNumber
						.replace(' ## ' + docNumber, '').replace(docNumber + ' ## ', '').replace(docNumber, '');
					if (docSubNumber) metadata.publicDocNumber = docNumber + ' ## ' + docSubNumber;
				}
				metadata.title = title;
				metadata.code = 'СП (Свод правил)';
				break;
			case 'СП (Свод правил)':
				metadata.code = 'СП (Свод правил)';
				break;
			case 'ФНП (Федеральные нормы и правила)':
				metadata.code = subType;
				docType = metadata.docType;
				section = docType.match(subT.abbr + '[^\\n]+')[0];
				metadata.section = section;
				metadata.docType = docType.replace(section, '').trim();
				title = metadata.title;
				prefix = /^Об утверждении (|и введении в действие )федеральных норм и правил в области [^"]+/i;
				prefix = title.match(prefix);
				if (prefix) {
					title = title.replace(prefix[0], '');
				} else {
					docNumber = /^НП-[0-9-]+/;
					docNumber = title.match(docNumber);
					if (docNumber) {
						docNumber = docNumber[0];
						title = title.replace(docNumber, '');
						docSubNumber = metadata.publicDocNumber
							.replace(' ## ' + docNumber, '').replace(docNumber + ' ## ', '').replace(docNumber, '');
						if (docSubNumber) metadata.publicDocNumber = docNumber + ' ## ' + docSubNumber;
					}
				}
				metadata.title = title.replace(/"/g, '');
				break;
			case 'ТР (Технический регламент)':
				title = metadata.title;
				title = title.replace(/^Об утверждении технического регламента /i, '');
				title = title.replace(/^о/, 'О');
				metadata.title = title.replace(/"/g, '');
				metadata.code = 'ТР (Технический регламент)';
				break;
			case 'Технический регламент Евразийского экономического союза':
			case 'Технический регламент Таможенного союза':
				// Remove document type and number prefix from title
				metadata.title = metadata.title.replace(/"/g, '');
				metadata.code = 'ТР (Технический регламент)';
				break;
		}

		// Tags
		if (subT.tags) metadata.tags = subT.tags;
	} else {
		// Remove authority from document type
		for (let legalType of legalTypes) {
			if (subType.indexOf(legalType) == 0) {
				metadata.subType = legalType;
				break;
			}
		}
	}

	// Remove authority from document type
	let docType = metadata.docType;
	for (let legalType of legalTypes) {
		if (docType.indexOf(legalType) == 0) {
			metadata.docType = legalType;
			break;
		}
	}

	// Extract pdf key
	let pdfKey = doc.querySelector(filters.pdfKeyScriptCSS);
	if (pdfKey) {
		pdfKey = pdfKey.innerText.match(/^[^']+'([A-Za-z0-9]+)/)[1];
		metadata.pdfKey = pdfKey;
		metadata.pdfURL = 'http://docs.cntd.ru/pdf/get/id/'
			+ metadata.CNTDID + '/key/' + pdfKey + '/file/1';
	}

	// Replace separator when multiple publication sources are provided
	if (metadata.published) metadata.published = metadata.published.replace(/[\t\n]+/g, ' ## ');

	// Parse dates with Russian month names
	if (metadata.dateApproved) metadata.dateApproved = parseDate(metadata.dateApproved);
	if (metadata.dateEnacted) metadata.dateEnacted = parseDate(metadata.dateEnacted);
	if (metadata.dateAmended) metadata.dateAmended = parseDate(metadata.dateAmended);
	if (metadata.dateRevoked) metadata.dateRevoked = parseDate(metadata.dateRevoked);
	if (!metadata.dateEnacted) metadata.dateEnacted = metadata.dateApproved;

	metadata.queries = {};
	let query = [];
	let srcJSON = JSON.parse(metadata.notes[0].replace(/\n/g, '|'));
	query.push(srcJSON[fieldMapRev.docType]);
	let dateApproved = srcJSON[fieldMapRev.dateApproved];
	if (dateApproved) query.push('от ' + dateApproved);
	query.push('N ' + srcJSON[fieldMapRev.publicDocNumber]);
	metadata.queries.notitle = query.join(' ');
	query.push(srcJSON[fieldMapRev.title]);
	metadata.queries.title = query.join(' ');
}


/**
 *	Parses date in Russian
 *
 *	@param {String} text - date string DD ruMonth YYYY
 *	@return {String} - date string M/D/Y.
 */
function parseDate(text) {
	const monthsRu = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
		июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 };
	let datePattern = /^\s*([0-9]{1,2})\s+([^\s]+)\s+([0-9]+)/;
	let date = text.match(datePattern);
	if (!date) return undefined;
	if (!monthsRu[date[2]]) return undefined;
	date = monthsRu[date[2]] + '/' + date[1] + '/' + date[3];
	return date;
}

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200128307",
		"items": [
			{
				"itemType": "report",
				"title": "Межгосударственная система стандартизации (МГСС). Основные положения (Переиздание)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"date": "10/01/2019",
				"extra": "CNTDID: 1200128307\nPublished: Официальное издание. М.: Стандартинформ, 2019 год\ndateEnactedOriginal: 7/01/2016\ndateApproved: 12/11/2015",
				"language": "Russian",
				"libraryCatalog": "CNTDF",
				"reportNumber": "1.0-2015",
				"reportType": "ГОСТ",
				"url": "http://docs.cntd.ru/document/1200128307",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "GOST"
					},
					{
						"tag": "standard"
					}
				],
				"notes": [
					"{\"Название документа\":\"ГОСТ 1.0-2015 Межгосударственная система стандартизации (МГСС). Основные положения (Переиздание)\",\"Номер документа\":\"1.0-2015\",\"Вид документа\":\"ГОСТ\",\"Принявший орган\":\"Росстандарт\",\"Статус\":\"Действующий\",\"Опубликован\":\"Официальное издание. М.: Стандартинформ, 2019 год\",\"Дата принятия\":\"11 декабря 2015\",\"Дата начала действия\":\"01 июля 2016\",\"Дата редакции\":\"01 октября 2019\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ГОСТ 1.0-2015 Межгосударственная система стандартизации (МГСС). Основные положения (Переиздание)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>1.0-2015</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ГОСТ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Росстандарт</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальное издание. М.: Стандартинформ, 2019 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>11 декабря 2015</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июля 2016</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>01 октября 2019</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901932011",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О внесении изменений в Указ Президента Российской Федерации от 16 июля 2004 года N 910 \"О мерах по совершенствованию государственного управления\" (утратил силу с 04.04.2006 на основании Указа Президента РФ от 30.03.2006 N 285)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Президент РФ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/26/2005",
				"codeNumber": "Указ",
				"extra": "CNTDID: 901932011\nPublished: Собрание законодательства Российской Федерации, N 18, 02.05.2005, ст.1665\ndateEnactedOriginal: 4/26/2005\ndateApproved: 4/26/2005\ndateRevoked: 4/04/2006",
				"language": "Russian",
				"publicLawNumber": "473",
				"url": "http://docs.cntd.ru/document/901932011",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "Inactive"
					},
					{
						"tag": "Revoked"
					}
				],
				"notes": [
					"{\"Название документа\":\"О внесении изменений в Указ Президента Российской Федерации от 16 июля 2004 года N 910 \\\"О мерах по совершенствованию государственного управления\\\" (утратил силу с 04.04.2006 на основании Указа Президента РФ от 30.03.2006 N 285)\",\"Номер документа\":\"473\",\"Вид документа\":\"Указ Президента РФ\",\"Принявший орган\":\"Президент РФ\",\"Статус\":\"Недействующий\",\"Опубликован\":\"Собрание законодательства Российской Федерации, N 18, 02.05.2005, ст.1665\",\"Дата принятия\":\"26 апреля 2005\",\"Дата начала действия\":\"26 апреля 2005\",\"Дата окончания действия\":\"04 апреля 2006\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>О внесении изменений в Указ Президента Российской Федерации от 16 июля 2004 года N 910 \"О мерах по совершенствованию государственного управления\" (утратил силу с 04.04.2006 на основании Указа Президента РФ от 30.03.2006 N 285)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>473</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Указ Президента РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Президент РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Недействующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Собрание законодательства Российской Федерации, N 18, 02.05.2005, ст.1665</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>26 апреля 2005</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>26 апреля 2005</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата окончания действия</td>\n        <td>04 апреля 2006</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901931853",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О награждении государственными наградами Российской Федерации работников государственного унитарного предприятия \"Московский метрополитен\"",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Президент РФ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/25/2005",
				"codeNumber": "Указ",
				"extra": "CNTDID: 901931853\nPublished: Собрание законодательства Российской Федерации, N 18, 02.05.2005\ndateEnactedOriginal: 4/25/2005\ndateApproved: 4/25/2005",
				"language": "Russian",
				"publicLawNumber": "472",
				"url": "http://docs.cntd.ru/document/901931853",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"О награждении государственными наградами Российской Федерации работников государственного унитарного предприятия \\\"Московский метрополитен\\\"\",\"Номер документа\":\"472\",\"Вид документа\":\"Указ Президента РФ\",\"Принявший орган\":\"Президент РФ\",\"Статус\":\"Действующий\",\"Опубликован\":\"Собрание законодательства Российской Федерации, N 18, 02.05.2005\",\"Дата принятия\":\"25 апреля 2005\",\"Дата начала действия\":\"25 апреля 2005\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>О награждении государственными наградами Российской Федерации работников государственного унитарного предприятия \"Московский метрополитен\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>472</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Указ Президента РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Президент РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Собрание законодательства Российской Федерации, N 18, 02.05.2005</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>25 апреля 2005</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>25 апреля 2005</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200102193",
		"items": [
			{
				"itemType": "report",
				"title": "Стандартизация в Российской Федерации. Основные положения (с Изменением N 1)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"date": "11/22/2013",
				"extra": "CNTDID: 1200102193\nPublished: официальное издание ## М.: Стандартинформ, 2013 год\ndateEnactedOriginal: 7/01/2013\ndateApproved: 11/23/2012",
				"language": "Russian",
				"libraryCatalog": "CNTDF",
				"reportNumber": "1.0-2012",
				"reportType": "ГОСТ Р",
				"url": "http://docs.cntd.ru/document/1200102193",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "GOST"
					},
					{
						"tag": "standard"
					}
				],
				"notes": [
					"{\"Название документа\":\"ГОСТ Р 1.0-2012 Стандартизация в Российской Федерации. Основные положения (с Изменением N 1)\",\"Номер документа\":\"1.0-2012\",\"Вид документа\":\"ГОСТ Р\",\"Принявший орган\":\"Росстандарт\",\"Статус\":\"Действующий\",\"Опубликован\":\"официальное издание\nМ.: Стандартинформ, 2013 год\",\"Дата принятия\":\"23 ноября 2012\",\"Дата начала действия\":\"01 июля 2013\",\"Дата редакции\":\"22 ноября 2013\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ГОСТ Р 1.0-2012 Стандартизация в Российской Федерации. Основные положения (с Изменением N 1)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>1.0-2012</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ГОСТ Р</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Росстандарт</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>официальное издание<br>М.: Стандартинформ, 2013 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>23 ноября 2012</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июля 2013</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>22 ноября 2013</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901712929",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О государственном регулировании обеспечения плодородия земель сельскохозяйственного назначения (с изменениями на 5 апреля 2016 года) (редакция, действующая с 1 июля 2016 года)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Государственная Дума",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/05/2016",
				"codeNumber": "Федеральный закон",
				"extra": "CNTDID: 901712929\nPublished: Собрание законодательства Российской Федерации, N 29, 20.07.98, ст.3399 ## Ведомости Федерального Собрания, N 22, 01.08.98\ndateEnactedOriginal: 7/16/1998\ndateApproved: 7/16/1998",
				"language": "Russian",
				"publicLawNumber": "101-ФЗ",
				"url": "http://docs.cntd.ru/document/901712929",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"О государственном регулировании обеспечения плодородия земель сельскохозяйственного назначения (с изменениями на 5 апреля 2016 года) (редакция, действующая с 1 июля 2016 года)\",\"Номер документа\":\"101-ФЗ\",\"Вид документа\":\"Федеральный закон\",\"Принявший орган\":\"Государственная Дума\",\"Статус\":\"Действующий\",\"Опубликован\":\"Собрание законодательства Российской Федерации, N 29, 20.07.98, ст.3399\nВедомости Федерального Собрания, N 22, 01.08.98\",\"Дата принятия\":\"16 июля 1998\",\"Дата редакции\":\"05 апреля 2016\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>О государственном регулировании обеспечения плодородия земель сельскохозяйственного назначения (с изменениями на 5 апреля 2016 года) (редакция, действующая с 1 июля 2016 года)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>101-ФЗ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Федеральный закон</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Государственная Дума</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Собрание законодательства Российской Федерации, N 29, 20.07.98, ст.3399<br>Ведомости Федерального Собрания, N 22, 01.08.98</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>16 июля 1998</td>\n    </tr>\n    \n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>05 апреля 2016</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901832805",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Гражданский процессуальный кодекс Российской Федерации (с изменениями на 2 декабря 2019 года) (редакция, действующая с 30 марта 2020 года)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Государственная Дума",
						"creatorType": "author"
					}
				],
				"dateEnacted": "12/02/2019",
				"code": "Гражданский процессуальный кодекс Российской Федерации",
				"codeNumber": "Федеральный закон",
				"extra": "CNTDID: 901832805\nPublished: Российская газета, N 220, 20.11.2002 ## Парламентская газета, N 220-221, 20.11.2002 ## Собрание законодательства Российской Федерации, N 46, 18.11.2002, ст.4532 ## Приложение к \"Российской газете\", N 46, 2002 год ## Ведомости Федерального Собрания РФ, N 33, 21.11.2002\ndateEnactedOriginal: 2/01/2003\ndateApproved: 11/14/2002",
				"language": "Russian",
				"publicLawNumber": "138-ФЗ",
				"url": "http://docs.cntd.ru/document/901832805",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "RF Code"
					}
				],
				"notes": [
					"{\"Название документа\":\"Гражданский процессуальный кодекс Российской Федерации (с изменениями на 2 декабря 2019 года) (редакция, действующая с 30 марта 2020 года)\",\"Номер документа\":\"138-ФЗ\",\"Вид документа\":\"Кодекс РФ\nФедеральный закон\",\"Принявший орган\":\"Государственная Дума\",\"Статус\":\"Действующий\",\"Опубликован\":\"Российская газета, N 220, 20.11.2002\nПарламентская газета, N 220-221, 20.11.2002\nСобрание законодательства Российской Федерации, N 46, 18.11.2002, ст.4532\nПриложение к \\\"Российской газете\\\", N 46, 2002 год\nВедомости Федерального Собрания РФ, N 33, 21.11.2002\",\"Дата принятия\":\"14 ноября 2002\",\"Дата начала действия\":\"01 февраля 2003\",\"Дата редакции\":\"02 декабря 2019\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Гражданский процессуальный кодекс Российской Федерации (с изменениями на 2 декабря 2019 года) (редакция, действующая с 30 марта 2020 года)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>138-ФЗ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Кодекс РФ<br>Федеральный закон</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Государственная Дума</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 220, 20.11.2002<br>Парламентская газета, N 220-221, 20.11.2002<br>Собрание законодательства Российской Федерации, N 46, 18.11.2002, ст.4532<br>Приложение к \"Российской газете\", N 46, 2002 год<br>Ведомости Федерального Собрания РФ, N 33, 21.11.2002</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>14 ноября 2002</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 февраля 2003</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>02 декабря 2019</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200003915",
		"items": [
			{
				"itemType": "report",
				"title": "Шайбы. Технические условия (с Изменениями N 1, 2, 3)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Госстандарт СССР",
						"creatorType": "author"
					}
				],
				"date": "8/01/2006",
				"extra": "CNTDID: 1200003915\nPublished: официальное издание ## Шайбы и контрящие элементы. Технические условия. Конструкция и размеры: Сб. стандартов. - М.: Стандартинформ, 2006 год\ndateEnactedOriginal: 1/01/1979\ndateApproved: 6/26/1978",
				"language": "Russian",
				"libraryCatalog": "CNTDF",
				"reportNumber": "11371-78",
				"reportType": "ГОСТ",
				"url": "http://docs.cntd.ru/document/1200003915",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "GOST"
					},
					{
						"tag": "standard"
					}
				],
				"notes": [
					"{\"Название документа\":\"ГОСТ 11371-78 Шайбы. Технические условия (с Изменениями N 1, 2, 3)\",\"Номер документа\":\"11371-78\",\"Вид документа\":\"ГОСТ\",\"Принявший орган\":\"Госстандарт СССР\",\"Статус\":\"Действующий\",\"Опубликован\":\"официальное издание\nШайбы и контрящие элементы. Технические условия. Конструкция и размеры: Сб. стандартов. - М.: Стандартинформ, 2006 год\",\"Дата принятия\":\"26 июня 1978\",\"Дата начала действия\":\"01 января 1979\",\"Дата редакции\":\"01 августа 2006\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ГОСТ 11371-78 Шайбы. Технические условия (с Изменениями N 1, 2, 3)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>11371-78</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ГОСТ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Госстандарт СССР</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>официальное издание<br>Шайбы и контрящие элементы. Технические условия. Конструкция и размеры: Сб. стандартов. - М.: Стандартинформ, 2006 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>26 июня 1978</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 января 1979</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>01 августа 2006</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/564602190",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "ОКАТО Общероссийский классификатор объектов административно-территориального деления ОК 019-95",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/01/2020",
				"codeNumber": "Изменение",
				"extra": "CNTDID: 564602190\ndateEnactedOriginal: 4/01/2020\ndateApproved: 3/13/2020",
				"language": "Russian",
				"publicLawNumber": "400/2020",
				"url": "http://docs.cntd.ru/document/564602190",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Изменение 400/2020 ОКАТО Общероссийский классификатор объектов административно-территориального деления ОК 019-95\",\"Номер документа\":\"400/2020\",\"Вид документа\":\"Изменение\",\"Принявший орган\":\"Росстандарт\",\"Статус\":\"Действующий\",\"Дата принятия\":\"13 марта 2020\",\"Дата начала действия\":\"01 апреля 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Изменение 400/2020 ОКАТО Общероссийский классификатор объектов административно-территориального деления ОК 019-95</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>400/2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Изменение</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Росстандарт</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>13 марта 2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 апреля 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/437253093",
		"items": [
			{
				"itemType": "report",
				"title": "Дороги автомобильные общего пользования. Смеси литые асфальтобетонные дорожные горячие и асфальтобетон литой дорожный. Методы испытаний",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"date": "6/01/2020",
				"extra": "CNTDID: 437253093\ndateEnactedOriginal: 6/01/2020\ndateApproved: 3/27/2020",
				"language": "Russian",
				"libraryCatalog": "CNTDF",
				"reportNumber": "54400-2020",
				"reportType": "ГОСТ Р",
				"url": "http://docs.cntd.ru/document/437253093",
				"attachments": [],
				"tags": [
					{
						"tag": "GOST"
					},
					{
						"tag": "Inactive"
					},
					{
						"tag": "standard"
					}
				],
				"notes": [
					"{\"Название документа\":\"ГОСТ Р 54400-2020 Дороги автомобильные общего пользования. Смеси литые асфальтобетонные дорожные горячие и асфальтобетон литой дорожный. Методы испытаний\",\"Номер документа\":\"54400-2020\",\"Вид документа\":\"ГОСТ Р\",\"Принявший орган\":\"Росстандарт\",\"Статус\":\"Документ в силу не вступил\",\"Дата принятия\":\"27 марта 2020\",\"Дата начала действия\":\"01 июня 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ГОСТ Р 54400-2020 Дороги автомобильные общего пользования. Смеси литые асфальтобетонные дорожные горячие и асфальтобетон литой дорожный. Методы испытаний</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>54400-2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ГОСТ Р</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Росстандарт</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Документ в силу не вступил</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>27 марта 2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июня 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200170667",
		"items": [
			{
				"itemType": "report",
				"title": "Параметры и критерии оценки качества вождения с целью оценки безопасности использования транспортных средств",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"date": "6/01/2020",
				"extra": "CNTDID: 1200170667\nPublished: Официальное издание. М.: Стандартинформ, 2020\ndateEnactedOriginal: 6/01/2020\ndateApproved: 12/25/2019",
				"language": "Russian",
				"libraryCatalog": "CNTDF",
				"reportNumber": "58782-2019",
				"reportType": "ГОСТ Р",
				"url": "http://docs.cntd.ru/document/1200170667",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "GOST"
					},
					{
						"tag": "Inactive"
					},
					{
						"tag": "standard"
					}
				],
				"notes": [
					"{\"Название документа\":\"ГОСТ Р 58782-2019 Параметры и критерии оценки качества вождения с целью оценки безопасности использования транспортных средств\",\"Номер документа\":\"58782-2019\",\"Вид документа\":\"ГОСТ Р\",\"Принявший орган\":\"Росстандарт\",\"Статус\":\"Документ в силу не вступил\",\"Опубликован\":\"Официальное издание. М.: Стандартинформ, 2020\",\"Дата принятия\":\"25 декабря 2019\",\"Дата начала действия\":\"01 июня 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ГОСТ Р 58782-2019 Параметры и критерии оценки качества вождения с целью оценки безопасности использования транспортных средств</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>58782-2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ГОСТ Р</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Росстандарт</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Документ в силу не вступил</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальное издание. М.: Стандартинформ, 2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>25 декабря 2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июня 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/563813381",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Государственная поверочная схема для средств измерений содержания неорганических компонентов в водных растворах",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Ростехнадзор",
						"creatorType": "author"
					}
				],
				"dateEnacted": "1/01/2020",
				"codeNumber": "Государственная поверочная схема",
				"extra": "CNTDID: 563813381\nPublished: Официальный сайт Росстандарта www.gost.ru по состоянию на 21.11.2019\ndateEnactedOriginal: 1/01/2020\ndateApproved: 11/01/2019",
				"language": "Russian",
				"url": "http://docs.cntd.ru/document/563813381",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Государственная поверочная схема для средств измерений содержания неорганических компонентов в водных растворах\",\"Принявший орган\":\"Ростехнадзор\",\"Статус\":\"Действующий\",\"Опубликован\":\"Официальный сайт Росстандарта www.gost.ru по состоянию на 21.11.2019\",\"Дата принятия\":\"01 ноября 2019\",\"Дата начала действия\":\"01 января 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Государственная поверочная схема для средств измерений содержания неорганических компонентов в водных растворах</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Ростехнадзор</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальный сайт Росстандарта www.gost.ru по состоянию на 21.11.2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>01 ноября 2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 января 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/564183718",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Методические рекомендации по определению допустимого рабочего давления магистральных нефтепроводов и нефтепродуктоводов",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Ростехнадзор",
						"creatorType": "author"
					}
				],
				"dateEnacted": "1/14/2020",
				"codeNumber": "РБ",
				"extra": "CNTDID: 564183718\ndateEnactedOriginal: 1/14/2020\ndateApproved: 1/14/2020",
				"language": "Russian",
				"url": "http://docs.cntd.ru/document/564183718",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Руководство по безопасности \\\"Методические рекомендации по определению допустимого рабочего давления магистральных нефтепроводов и нефтепродуктоводов\\\"\",\"Вид документа\":\"РБ\",\"Принявший орган\":\"Ростехнадзор\",\"Статус\":\"Действующий\",\"Дата принятия\":\"14 января 2020\",\"Дата начала действия\":\"14 января 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Руководство по безопасности \"Методические рекомендации по определению допустимого рабочего давления магистральных нефтепроводов и нефтепродуктоводов\"</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>РБ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Ростехнадзор</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>14 января 2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>14 января 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/564444866",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Руководство по безопасности при использовании атомной энергии \"Рекомендации по оценке уровня безопасности пунктов хранения и проведению анализа несоответствий требованиям действующих федеральных норм и правил в области использования атомной энергии\"",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Ростехнадзор",
						"creatorType": "author"
					}
				],
				"dateEnacted": "3/12/2020",
				"codeNumber": "РБ",
				"extra": "CNTDID: 564444866\ndateEnactedOriginal: 3/12/2020\ndateApproved: 3/12/2020",
				"language": "Russian",
				"publicLawNumber": "164-20",
				"url": "http://docs.cntd.ru/document/564444866",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"РБ-164-20 Руководство по безопасности при использовании атомной энергии \\\"Рекомендации по оценке уровня безопасности пунктов хранения и проведению анализа несоответствий требованиям действующих федеральных норм и правил в области использования атомной энергии\\\"\",\"Номер документа\":\"164-20\",\"Вид документа\":\"РБ\",\"Принявший орган\":\"Ростехнадзор\",\"Статус\":\"Действующий\",\"Дата принятия\":\"12 марта 2020\",\"Дата начала действия\":\"12 марта 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>РБ-164-20 Руководство по безопасности при использовании атомной энергии \"Рекомендации по оценке уровня безопасности пунктов хранения и проведению анализа несоответствий требованиям действующих федеральных норм и правил в области использования атомной энергии\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>164-20</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>РБ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Ростехнадзор</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>12 марта 2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>12 марта 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200105768",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Инструкция по промышленной безопасности и охране труда при обслуживании и эксплуатации вентиляционных установок (актуализированная редакция)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "ООО \"СПКТБ Нефтегазмаш\"",
						"creatorType": "author"
					}
				],
				"dateEnacted": "5/24/2017",
				"codeNumber": "Инструкция по промышленной безопасности и охране труда",
				"extra": "CNTDID: 1200105768\ndateEnactedOriginal: 5/24/2017\ndateApproved: 5/24/2017",
				"language": "Russian",
				"publicLawNumber": "409-2008",
				"url": "http://docs.cntd.ru/document/1200105768",
				"attachments": [],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ИПБОТ 409-2008 Инструкция по промышленной безопасности и охране труда при обслуживании и эксплуатации вентиляционных установок (актуализированная редакция)\",\"Номер документа\":\"409-2008\",\"Принявший орган\":\"ООО \\\"СПКТБ Нефтегазмаш\\\"\",\"Статус\":\"Действующий\",\"Дата принятия\":\"24 мая 2017\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ИПБОТ 409-2008 Инструкция по промышленной безопасности и охране труда при обслуживании и эксплуатации вентиляционных установок (актуализированная редакция)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>409-2008</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>ООО \"СПКТБ Нефтегазмаш\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>24 мая 2017</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/557540415",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в воздухе рабочей зоны ## ГН 2.1.6.3537-18 Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в атмосферном воздухе городских и сельских поселений ## Об утверждении гигиенических нормативов ГН 2.1.6.3537-18 \"Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в атмосферном воздухе городских и сельских поселений\" и гигиенических нормативов ГН 2.2.6.3538-18 \"Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в воздухе рабочей зоны\"",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Главный государственный санитарный врач РФ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "6/09/2018",
				"codeNumber": "ГН (Гигиенические нормативы)",
				"extra": "CNTDID: 557540415\nPublished: Официальный интернет-портал правовой информации www.pravo.gov.ru, 29.05.2018, N 0001201805290049\ndateEnactedOriginal: 6/09/2018\ndateApproved: 5/10/2018\ndateRevoked: 5/10/2028",
				"language": "Russian",
				"publicLawNumber": "2.2.6.3538-18 ## 32 ## 2.1.6.3537-18",
				"url": "http://docs.cntd.ru/document/557540415",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "Inactive"
					},
					{
						"tag": "Revoked"
					}
				],
				"notes": [
					"{\"Название документа\":\"ГН 2.2.6.3538-18 Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в воздухе рабочей зоны\nГН 2.1.6.3537-18 Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в атмосферном воздухе городских и сельских поселений\nОб утверждении гигиенических нормативов ГН 2.1.6.3537-18 \\\"Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в атмосферном воздухе городских и сельских поселений\\\" и гигиенических нормативов ГН 2.2.6.3538-18 \\\"Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в воздухе рабочей зоны\\\"\",\"Номер документа\":\"32\n2.1.6.3537-18\n2.2.6.3538-18\",\"Вид документа\":\"Постановление Главного государственного санитарного врача РФ\nГН\",\"Принявший орган\":\"Главный государственный санитарный врач РФ\",\"Статус\":\"Действующий\nС ограниченным сроком действия\",\"Опубликован\":\"Официальный интернет-портал правовой информации www.pravo.gov.ru, 29.05.2018, N 0001201805290049\",\"Дата принятия\":\"10 мая 2018\",\"Дата начала действия\":\"09 июня 2018\",\"Дата окончания действия\":\"10 мая 2028\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ГН 2.2.6.3538-18 Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в воздухе рабочей зоны<br>ГН 2.1.6.3537-18 Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в атмосферном воздухе городских и сельских поселений<br>Об утверждении гигиенических нормативов ГН 2.1.6.3537-18 \"Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в атмосферном воздухе городских и сельских поселений\" и гигиенических нормативов ГН 2.2.6.3538-18 \"Предельно допустимые концентрации (ПДК) микроорганизмов-продуцентов, бактериальных препаратов и их компонентов в воздухе рабочей зоны\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>32<br>2.1.6.3537-18<br>2.2.6.3538-18</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Главного государственного санитарного врача РФ<br>ГН</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Главный государственный санитарный врач РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий<br>С ограниченным сроком действия</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальный интернет-портал правовой информации www.pravo.gov.ru, 29.05.2018, N 0001201805290049</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>10 мая 2018</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>09 июня 2018</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата окончания действия</td>\n        <td>10 мая 2028</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901865875",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Санитарные правила по определению класса опасности токсичных отходов производства и потребления ## О введении в действие СП 2.1.7.1386-03 (с изменениями на 31 марта 2011 года)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Главный государственный санитарный врач РФ",
						"creatorType": "author"
					},
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Минздравмедпром России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "3/31/2011",
				"code": "СП (Санитарные правила)",
				"codeNumber": "СП (Санитарные правила)",
				"extra": "CNTDID: 901865875\nPublished: Российская газета, N 119/1, 20.06.2003 (специальный выпуск) ## Сборник нормативно-правовых актов в области санитарно-эпидемиологического благополучия населения. Часть II.- М.: Федеральный центр госсанэпиднадзора Минздрава России, 2003 год\ndateEnactedOriginal: 7/01/2003\ndateApproved: 6/16/2003",
				"language": "Russian",
				"publicLawNumber": "2.1.7.1386-03 ## 144",
				"url": "http://docs.cntd.ru/document/901865875",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СП 2.1.7.1386-03 Санитарные правила по определению класса опасности токсичных отходов производства и потребления\nО введении в действие СП 2.1.7.1386-03 (с изменениями на 31 марта 2011 года)\",\"Номер документа\":\"144\n2.1.7.1386-03\",\"Вид документа\":\"Постановление Главного государственного санитарного врача РФ\nСП (Санитарные правила)\",\"Принявший орган\":\"Главный государственный санитарный врач РФ\nМинздравмедпром России\",\"Статус\":\"Действующий\",\"Опубликован\":\"Российская газета, N 119/1, 20.06.2003 (специальный выпуск)\nСборник нормативно-правовых актов в области санитарно-эпидемиологического благополучия населения. Часть II.- М.: Федеральный центр госсанэпиднадзора Минздрава России, 2003 год\",\"Дата принятия\":\"16 июня 2003\",\"Дата начала действия\":\"01 июля 2003\",\"Дата редакции\":\"31 марта 2011\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СП 2.1.7.1386-03 Санитарные правила по определению класса опасности токсичных отходов производства и потребления<br>О введении в действие СП 2.1.7.1386-03 (с изменениями на 31 марта 2011 года)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>144<br>2.1.7.1386-03</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Главного государственного санитарного врача РФ<br>СП (Санитарные правила)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Главный государственный санитарный врач РФ<br>Минздравмедпром России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 119/1, 20.06.2003 (специальный выпуск)<br>Сборник нормативно-правовых актов в области санитарно-эпидемиологического благополучия населения. Часть II.- М.: Федеральный центр госсанэпиднадзора Минздрава России, 2003 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>16 июня 2003</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июля 2003</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>31 марта 2011</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901862250",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Предельно допустимые концентрации (ПДК) вредных веществ в воздухе рабочей зоны ## О введении в действие ГН 2.2.5.1313-03 (с изменениями на 29 июня 2017 года) (утратило силу с 04.05.2018 на основании постановления Главного государственного санитарного врача РФ от 13.02.2018 N 25)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Главный государственный санитарный врач РФ",
						"creatorType": "author"
					},
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Минздрав России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "6/29/2017",
				"codeNumber": "ГН (Гигиенические нормативы)",
				"extra": "CNTDID: 901862250\nPublished: Российская газета, N 119/1, 20.06.2003 (специальный выпуск) ## Гигиенические нормативы ГН 2.2.5.1313-03, издание официальное, Москва, 2003 год\ndateEnactedOriginal: 6/15/2003\ndateApproved: 4/30/2003\ndateRevoked: 5/04/2018",
				"language": "Russian",
				"publicLawNumber": "2.2.5.1313-03 ## 76",
				"url": "http://docs.cntd.ru/document/901862250",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "Inactive"
					},
					{
						"tag": "Revoked"
					}
				],
				"notes": [
					"{\"Название документа\":\"ГН 2.2.5.1313-03 Предельно допустимые концентрации (ПДК) вредных веществ в воздухе рабочей зоны\nО введении в действие ГН 2.2.5.1313-03 (с изменениями на 29 июня 2017 года) (утратило силу с 04.05.2018 на основании постановления Главного государственного санитарного врача РФ от 13.02.2018 N 25)\",\"Номер документа\":\"76\n2.2.5.1313-03\",\"Вид документа\":\"Постановление Главного государственного санитарного врача РФ\nГН\",\"Принявший орган\":\"Главный государственный санитарный врач РФ\nМинздрав России\",\"Статус\":\"Недействующий\",\"Опубликован\":\"Российская газета, N 119/1, 20.06.2003 (специальный выпуск)\nГигиенические нормативы ГН 2.2.5.1313-03, издание официальное, Москва, 2003 год\",\"Дата принятия\":\"30 апреля 2003\n27 апреля 2003\",\"Дата начала действия\":\"15 июня 2003\",\"Дата окончания действия\":\"04 мая 2018\",\"Дата редакции\":\"29 июня 2017\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ГН 2.2.5.1313-03 Предельно допустимые концентрации (ПДК) вредных веществ в воздухе рабочей зоны<br>О введении в действие ГН 2.2.5.1313-03 (с изменениями на 29 июня 2017 года) (утратило силу с 04.05.2018 на основании постановления Главного государственного санитарного врача РФ от 13.02.2018 N 25)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>76<br>2.2.5.1313-03</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Главного государственного санитарного врача РФ<br>ГН</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Главный государственный санитарный врач РФ<br>Минздрав России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Недействующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 119/1, 20.06.2003 (специальный выпуск)<br>Гигиенические нормативы ГН 2.2.5.1313-03, издание официальное, Москва, 2003 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>30 апреля 2003<br>27 апреля 2003</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>15 июня 2003</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата окончания действия</td>\n        <td>04 мая 2018</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>29 июня 2017</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200041776",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Руководство по организации перевозки опасных грузов автомобильным транспортом",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Департамент автомобильного транспорта Минтранса России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "2/08/1996",
				"codeNumber": "РД",
				"extra": "CNTDID: 1200041776\nPublished: / Министерство транспорта Российской Федерации. - М., 1996 год\ndateEnactedOriginal: 2/08/1996\ndateApproved: 2/08/1996",
				"language": "Russian",
				"publicLawNumber": "3112199-0199-96",
				"url": "http://docs.cntd.ru/document/1200041776",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"РД 3112199-0199-96 Руководство по организации перевозки опасных грузов автомобильным транспортом\",\"Номер документа\":\"3112199-0199-96\",\"Вид документа\":\"РД\",\"Принявший орган\":\"Департамент автомобильного транспорта Минтранса России\",\"Статус\":\"Действующий\",\"Опубликован\":\"/ Министерство транспорта Российской Федерации. - М., 1996 год\",\"Дата принятия\":\"08 февраля 1996\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>РД 3112199-0199-96 Руководство по организации перевозки опасных грузов автомобильным транспортом</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>3112199-0199-96</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>РД</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Департамент автомобильного транспорта Минтранса России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>/ Министерство транспорта Российской Федерации. - М., 1996 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>08 февраля 1996</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200076312",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Санитарные нормы и правила по ограничению шума на территориях и в помещениях производственных предприятий",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Заместитель главного государственного санитарного врача СССР",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/30/1969",
				"codeNumber": "СанПиН",
				"extra": "CNTDID: 1200076312\nPublished: / Министерство здравоохранения СССР. - М., 1969 год\ndateEnactedOriginal: 4/30/1969\ndateApproved: 4/30/1969",
				"language": "Russian",
				"url": "http://docs.cntd.ru/document/1200076312",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Санитарные нормы и правила по ограничению шума на территориях и в помещениях производственных предприятий\",\"Вид документа\":\"СанПиН\",\"Принявший орган\":\"Заместитель главного государственного санитарного врача СССР\",\"Статус\":\"Действующий\",\"Опубликован\":\"/ Министерство здравоохранения СССР. - М., 1969 год\",\"Дата принятия\":\"30 апреля 1969\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Санитарные нормы и правила по ограничению шума на территориях и в помещениях производственных предприятий</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СанПиН</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Заместитель главного государственного санитарного врача СССР</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>/ Министерство здравоохранения СССР. - М., 1969 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>30 апреля 1969</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200034684",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Санитарные нормы допустимых концентраций (ПДК) химических веществ в почве",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Заместитель главного государственного санитарного врача СССР",
						"creatorType": "author"
					}
				],
				"dateEnacted": "10/30/1987",
				"code": "СП (Санитарные правила)",
				"codeNumber": "СанПиН",
				"extra": "CNTDID: 1200034684\nPublished: Сборник важнейших официальных материалов по санитарным и противоэпидемическим вопросам. В семи томах. Том 2. В двух частях. Часть 2. - М.: МП \"Рарог\", 1992 год\ndateEnactedOriginal: 10/30/1987\ndateApproved: 10/30/1987",
				"language": "Russian",
				"publicLawNumber": "42-128-4433-87",
				"url": "http://docs.cntd.ru/document/1200034684",
				"attachments": [],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СанПиН 42-128-4433-87 Санитарные нормы допустимых концентраций (ПДК) химических веществ в почве\",\"Номер документа\":\"42-128-4433-87\",\"Вид документа\":\"СанПиН\",\"Принявший орган\":\"Заместитель главного государственного санитарного врача СССР\",\"Статус\":\"Действующий\",\"Опубликован\":\"Сборник важнейших официальных материалов по санитарным и противоэпидемическим вопросам. В семи томах. Том 2. В двух частях. Часть 2. - М.: МП \\\"Рарог\\\", 1992 год\",\"Дата принятия\":\"30 октября 1987\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СанПиН 42-128-4433-87 Санитарные нормы допустимых концентраций (ПДК) химических веществ в почве</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>42-128-4433-87</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СанПиН</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Заместитель главного государственного санитарного врача СССР</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Сборник важнейших официальных материалов по санитарным и противоэпидемическим вопросам. В семи томах. Том 2. В двух частях. Часть 2. - М.: МП \"Рарог\", 1992 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>30 октября 1987</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901852023",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Гигиенические требования к проектированию предприятий и установок атомной промышленности (СПП ПУАП-03) ## О введении в действие санитарно-эпидемиологических правил и нормативов СанПиН 2.6.1.07-03 \"Гигиенические требования к проектированию предприятий и установок атомной промышленности\" (с изменениями на 15 мая 2003 года)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Главный государственный санитарный врач РФ",
						"creatorType": "author"
					},
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Минздрав России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "5/15/2003",
				"code": "СП (Санитарные правила)",
				"codeNumber": "СанПиН",
				"extra": "CNTDID: 901852023\nPublished: Российская газета, N 71, 12.04.2003 ## Бюллетень нормативных актов федеральных органов исполнительной власти, N 25, 23.06.2003 ## Приложение к \"Российской газете\", N 27, 2003 год (опубликовано без приложения)\ndateEnactedOriginal: 4/23/2003\ndateApproved: 2/04/2003",
				"language": "Russian",
				"publicLawNumber": "2.6.1.07-03 ## 6",
				"url": "http://docs.cntd.ru/document/901852023",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СанПиН 2.6.1.07-03 Гигиенические требования к проектированию предприятий и установок атомной промышленности (СПП ПУАП-03)\nО введении в действие санитарно-эпидемиологических правил и нормативов СанПиН 2.6.1.07-03 \\\"Гигиенические требования к проектированию предприятий и установок атомной промышленности\\\" (с изменениями на 15 мая 2003 года)\",\"Номер документа\":\"6\n2.6.1.07-03\",\"Вид документа\":\"Постановление Главного государственного санитарного врача РФ\nСанПиН\",\"Принявший орган\":\"Главный государственный санитарный врач РФ\nМинздрав России\",\"Статус\":\"Действующий\",\"Опубликован\":\"Российская газета, N 71, 12.04.2003\nБюллетень нормативных актов федеральных органов исполнительной власти, N 25, 23.06.2003\nПриложение к \\\"Российской газете\\\", N 27, 2003 год (опубликовано без приложения)\",\"Дата принятия\":\"04 февраля 2003\",\"Дата начала действия\":\"23 апреля 2003\",\"Дата редакции\":\"15 мая 2003\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СанПиН 2.6.1.07-03 Гигиенические требования к проектированию предприятий и установок атомной промышленности (СПП ПУАП-03)<br>О введении в действие санитарно-эпидемиологических правил и нормативов СанПиН 2.6.1.07-03 \"Гигиенические требования к проектированию предприятий и установок атомной промышленности\" (с изменениями на 15 мая 2003 года)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>6<br>2.6.1.07-03</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Главного государственного санитарного врача РФ<br>СанПиН</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Главный государственный санитарный врач РФ<br>Минздрав России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 71, 12.04.2003<br>Бюллетень нормативных актов федеральных органов исполнительной власти, N 25, 23.06.2003<br>Приложение к \"Российской газете\", N 27, 2003 год (опубликовано без приложения)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>04 февраля 2003</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>23 апреля 2003</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>15 мая 2003</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200034335",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Межотраслевые правила по охране труда при производстве асбеста и асбестосодержащих материалов и изделий",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Министерство труда и социального развития РФ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "7/01/2000",
				"codeNumber": "ПОТ РМ",
				"extra": "CNTDID: 1200034335\nPublished: / Минтруда РФ. - СПб.: ЦОТПБСП, 2000 год\ndateEnactedOriginal: 7/01/2000\ndateApproved: 1/31/2000",
				"language": "Russian",
				"publicLawNumber": "010-2000",
				"url": "http://docs.cntd.ru/document/1200034335",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ПОТ РМ-010-2000 Межотраслевые правила по охране труда при производстве асбеста и асбестосодержащих материалов и изделий\",\"Номер документа\":\"010-2000\",\"Вид документа\":\"ПОТ РМ\",\"Принявший орган\":\"Министерство труда и социального развития РФ\",\"Статус\":\"Действующий\",\"Опубликован\":\"/ Минтруда РФ. - СПб.: ЦОТПБСП, 2000 год\",\"Дата принятия\":\"31 января 2000\",\"Дата начала действия\":\"01 июля 2000\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ПОТ РМ-010-2000 Межотраслевые правила по охране труда при производстве асбеста и асбестосодержащих материалов и изделий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>010-2000</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ПОТ РМ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Министерство труда и социального развития РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>/ Минтруда РФ. - СПб.: ЦОТПБСП, 2000 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>31 января 2000</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июля 2000</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200008143",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Межотраслевые правила по охране труда при использовании химических веществ",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Министерство труда и социального развития РФ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/01/1998",
				"codeNumber": "ПОТ РМ",
				"extra": "CNTDID: 1200008143\nPublished: СПб.: ЦОТПБСП, 2000 год\ndateEnactedOriginal: 4/01/1998\ndateApproved: 9/17/1997",
				"language": "Russian",
				"publicLawNumber": "004-97",
				"url": "http://docs.cntd.ru/document/1200008143",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ПОТ Р М-004-97 Межотраслевые правила по охране труда при использовании химических веществ\",\"Номер документа\":\"004-97\",\"Вид документа\":\"ПОТ РМ\",\"Принявший орган\":\"Министерство труда и социального развития РФ\",\"Статус\":\"Действующий\",\"Опубликован\":\"СПб.: ЦОТПБСП, 2000 год\",\"Дата принятия\":\"17 сентября 1997\",\"Дата начала действия\":\"01 апреля 1998\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ПОТ Р М-004-97 Межотраслевые правила по охране труда при использовании химических веществ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>004-97</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ПОТ РМ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Министерство труда и социального развития РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>СПб.: ЦОТПБСП, 2000 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>17 сентября 1997</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 апреля 1998</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901821239",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Межотраслевые правила по охране труда при проведении работ по пайке и лужению изделий ## Об утверждении Межотраслевых правил по охране труда при проведении работ по пайке и лужению изделий",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Министерство труда и социального развития РФ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "10/01/2002",
				"codeNumber": "ПОТ РМ",
				"extra": "CNTDID: 901821239\nPublished: Российская газета, N 154-155, 20.08.2002 ## Бюллетень нормативных актов федер. органов исполнит. власти, N32, 12.08.2002 ## Бюллетень Министерства труда и социального развития РФ, N 7, 2002 год\ndateEnactedOriginal: 10/01/2002\ndateApproved: 6/17/2002",
				"language": "Russian",
				"publicLawNumber": "022-2002 ## 41",
				"url": "http://docs.cntd.ru/document/901821239",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ПОТ Р М-022-2002 Межотраслевые правила по охране труда при проведении работ по пайке и лужению изделий\nОб утверждении Межотраслевых правил по охране труда при проведении работ по пайке и лужению изделий\",\"Номер документа\":\"41\n022-2002\",\"Вид документа\":\"Постановление Министерства труда и социального развития РФ\nПОТ РМ\",\"Принявший орган\":\"Министерство труда и социального развития РФ\",\"Статус\":\"Действующий\",\"Опубликован\":\"Российская газета, N 154-155, 20.08.2002\nБюллетень нормативных актов федер. органов исполнит. власти, N32, 12.08.2002\nБюллетень Министерства труда и социального развития РФ, N 7, 2002 год\",\"Дата принятия\":\"17 июня 2002\",\"Дата начала действия\":\"01 октября 2002\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ПОТ Р М-022-2002 Межотраслевые правила по охране труда при проведении работ по пайке и лужению изделий<br>Об утверждении Межотраслевых правил по охране труда при проведении работ по пайке и лужению изделий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>41<br>022-2002</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Министерства труда и социального развития РФ<br>ПОТ РМ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Министерство труда и социального развития РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 154-155, 20.08.2002<br>Бюллетень нормативных актов федер. органов исполнит. власти, N32, 12.08.2002<br>Бюллетень Министерства труда и социального развития РФ, N 7, 2002 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>17 июня 2002</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 октября 2002</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901857383",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Правила сертификации электрооборудования для взрывоопасных сред",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Госстандарт России",
						"creatorType": "author"
					},
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Госгортехнадзор России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "6/09/2003",
				"codeNumber": "ПБ",
				"extra": "CNTDID: 901857383\nPublished: Российская газета, N 101, 29.05.2003 ## Бюллетень нормативных актов федеральных органов исполнительной власти, N 28, 14.07.2003 ## Вестник Госстандарта России, N 6, 2003 год ## официальное издание, Серия 03. Нормативные документы межотраслевого применения по вопросам промышленной безопасности и охраны недр. Вып.23. - М.: ГУП \"НТЦ \"Промышленная безопасность\", 2003 год\ndateEnactedOriginal: 6/09/2003\ndateApproved: 3/19/2003\ndateRevoked: 1/01/2021",
				"language": "Russian",
				"publicLawNumber": "28/10 ## 03-538-03",
				"url": "http://docs.cntd.ru/document/901857383",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [
					{
						"tag": "Revoked"
					}
				],
				"notes": [
					"{\"Название документа\":\"Об утверждении Правил сертификации электрооборудования для взрывоопасных сред\",\"Номер документа\":\"28/10\n03-538-03\",\"Вид документа\":\"Постановление Госстандарта России\nПостановление Госгортехнадзора России\nПБ\",\"Принявший орган\":\"Госстандарт России\nГосгортехнадзор России\",\"Статус\":\"Действующий\",\"Опубликован\":\"Российская газета, N 101, 29.05.2003\nБюллетень нормативных актов федеральных органов исполнительной власти, N 28, 14.07.2003\nВестник Госстандарта России, N 6, 2003 год\nофициальное издание, Серия 03. Нормативные документы межотраслевого применения по вопросам промышленной безопасности и охраны недр. Вып.23. - М.: ГУП \\\"НТЦ \\\"Промышленная безопасность\\\", 2003 год\",\"Дата принятия\":\"19 марта 2003\",\"Дата начала действия\":\"09 июня 2003\",\"Дата окончания действия\":\"01 января 2021\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Об утверждении Правил сертификации электрооборудования для взрывоопасных сред</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>28/10<br>03-538-03</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Госстандарта России<br>Постановление Госгортехнадзора России<br>ПБ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Госстандарт России<br>Госгортехнадзор России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 101, 29.05.2003<br>Бюллетень нормативных актов федеральных органов исполнительной власти, N 28, 14.07.2003<br>Вестник Госстандарта России, N 6, 2003 год<br>официальное издание, Серия 03. Нормативные документы межотраслевого применения по вопросам промышленной безопасности и охраны недр. Вып.23. - М.: ГУП \"НТЦ \"Промышленная безопасность\", 2003 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>19 марта 2003</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>09 июня 2003</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата окончания действия</td>\n        <td>01 января 2021</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200029691",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Правила охраны сооружений и природных объектов от вредного влияния подземных горных разработок на угольных месторождениях",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Госгортехнадзор России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "3/16/1998",
				"codeNumber": "ПБ",
				"extra": "CNTDID: 1200029691\nPublished: / Серия \"Библиотека горного инженера\". Справочник по охране недр. Том 7 \"Охрана недр\". Книга 2. - М.: Изд-во \"Горное дело\" ООО \"Киммерийский центр\", 2011 год\ndateEnactedOriginal: 3/16/1998\ndateApproved: 3/16/1998",
				"language": "Russian",
				"publicLawNumber": "07-269-98 ## 13",
				"url": "http://docs.cntd.ru/document/1200029691",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ПБ 07-269-98 Правила охраны сооружений и природных объектов от вредного влияния подземных горных разработок на угольных месторождениях\",\"Номер документа\":\"13\n07-269-98\",\"Вид документа\":\"Постановление Госгортехнадзора России\nПБ\",\"Принявший орган\":\"Госгортехнадзор России\",\"Статус\":\"Действующий\",\"Опубликован\":\"/ Серия \\\"Библиотека горного инженера\\\". Справочник по охране недр. Том 7 \\\"Охрана недр\\\". Книга 2. - М.: Изд-во \\\"Горное дело\\\" ООО \\\"Киммерийский центр\\\", 2011 год\",\"Дата принятия\":\"16 марта 1998\",\"Дата начала действия\":\"16 марта 1998\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ПБ 07-269-98 Правила охраны сооружений и природных объектов от вредного влияния подземных горных разработок на угольных месторождениях</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>13<br>07-269-98</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Госгортехнадзора России<br>ПБ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Госгортехнадзор России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>/ Серия \"Библиотека горного инженера\". Справочник по охране недр. Том 7 \"Охрана недр\". Книга 2. - М.: Изд-во \"Горное дело\" ООО \"Киммерийский центр\", 2011 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>16 марта 1998</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>16 марта 1998</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/563400440",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Инженерные изыскания для строительства в районах распространения набухающих грунтов. Общие требования",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Министерство строительства и жилищно-коммунального хозяйства Российской Федерации",
						"creatorType": "author"
					}
				],
				"dateEnacted": "7/29/2019",
				"code": "СП (Свод правил)",
				"codeNumber": "СП (Свод правил)",
				"extra": "CNTDID: 563400440\nPublished: Официальное издание. М.: Стандартинформ, 2019 год\ndateEnactedOriginal: 7/29/2019\ndateApproved: 1/28/2019",
				"language": "Russian",
				"publicLawNumber": "449.1326000.2019",
				"url": "http://docs.cntd.ru/document/563400440",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СП 449.1326000.2019 Инженерные изыскания для строительства в районах распространения набухающих грунтов. Общие требования\",\"Номер документа\":\"449.1326000.2019\",\"Вид документа\":\"СП (Свод правил)\",\"Принявший орган\":\"Министерство строительства и жилищно-коммунального хозяйства Российской Федерации\",\"Статус\":\"Действующий\",\"Опубликован\":\"Официальное издание. М.: Стандартинформ, 2019 год\",\"Дата принятия\":\"28 января 2019\",\"Дата начала действия\":\"29 июля 2019\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СП 449.1326000.2019 Инженерные изыскания для строительства в районах распространения набухающих грунтов. Общие требования</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>449.1326000.2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СП (Свод правил)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Министерство строительства и жилищно-коммунального хозяйства Российской Федерации</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальное издание. М.: Стандартинформ, 2019 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>28 января 2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>29 июля 2019</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/902359424",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О безопасности взрывчатых веществ и изделий на их основе",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Комиссия Таможенного союза",
						"creatorType": "author"
					}
				],
				"dateEnacted": "7/01/2014",
				"code": "ТР (Технический регламент)",
				"codeNumber": "Технический регламент Таможенного союза",
				"extra": "CNTDID: 902359424\nPublished: Официальный сайт Комиссии таможенного союза www.tsouz.ru, 20.07.2012\ndateEnactedOriginal: 7/01/2014\ndateApproved: 7/20/2012",
				"language": "Russian",
				"publicLawNumber": "ТР ТС 028/2012",
				"url": "http://docs.cntd.ru/document/902359424",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ТР ТС 028/2012 Технический регламент Таможенного союза \\\"О безопасности взрывчатых веществ и изделий на их основе\\\"\",\"Номер документа\":\"ТР ТС 028/2012\",\"Вид документа\":\"Технический регламент Таможенного союза\nТехнический регламент\",\"Принявший орган\":\"Комиссия Таможенного союза\",\"Статус\":\"Действующий\",\"Опубликован\":\"Официальный сайт Комиссии таможенного союза www.tsouz.ru, 20.07.2012\",\"Дата принятия\":\"20 июля 2012\",\"Дата начала действия\":\"01 июля 2014\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ТР ТС 028/2012 Технический регламент Таможенного союза \"О безопасности взрывчатых веществ и изделий на их основе\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>ТР ТС 028/2012</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Технический регламент Таможенного союза<br>Технический регламент</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Комиссия Таможенного союза</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальный сайт Комиссии таможенного союза www.tsouz.ru, 20.07.2012</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>20 июля 2012</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июля 2014</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/456090353",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О безопасности упакованной питьевой воды, включая природную минеральную воду",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Совет ЕЭК",
						"creatorType": "author"
					}
				],
				"dateEnacted": "1/01/2019",
				"code": "ТР (Технический регламент)",
				"codeNumber": "Технический регламент Евразийского экономического союза",
				"extra": "CNTDID: 456090353\nPublished: Официальный сайт Евразийского экономического союза www.eaeunion.org, 05.09.2017\ndateEnactedOriginal: 1/01/2019\ndateApproved: 6/23/2017",
				"language": "Russian",
				"publicLawNumber": "ТР ЕАЭС 044/2017",
				"url": "http://docs.cntd.ru/document/456090353",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ТР ЕАЭС 044/2017 Технический регламент Евразийского экономического союза \\\"О безопасности упакованной питьевой воды, включая природную минеральную воду\\\"\",\"Номер документа\":\"ТР ЕАЭС 044/2017\",\"Вид документа\":\"Технический регламент\",\"Принявший орган\":\"Совет ЕЭК\",\"Статус\":\"Действующий\",\"Опубликован\":\"Официальный сайт Евразийского экономического союза www.eaeunion.org, 05.09.2017\",\"Дата принятия\":\"23 июня 2017\",\"Дата начала действия\":\"01 января 2019\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ТР ЕАЭС 044/2017 Технический регламент Евразийского экономического союза \"О безопасности упакованной питьевой воды, включая природную минеральную воду\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>ТР ЕАЭС 044/2017</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Технический регламент</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Совет ЕЭК</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальный сайт Евразийского экономического союза www.eaeunion.org, 05.09.2017</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>23 июня 2017</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 января 2019</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200043175",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Технический регламент операционного контроля качества строительно-монтажных и специальных работ при возведении зданий и сооружений. 08. Устройство гидроизоляции подземной части здания",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Руководитель Комплекса архитектуры, строительства, развития и реконструкции города",
						"creatorType": "author"
					}
				],
				"dateEnacted": "6/30/2000",
				"code": "ТР (Технический регламент)",
				"codeNumber": "ТР (Технический регламент)",
				"extra": "CNTDID: 1200043175\nPublished: / Правительство Москвы; Комплекс архитектуры, строительства, развития и реконструкции города. - М., 2000 год\ndateEnactedOriginal: 6/30/2000\ndateApproved: 6/30/2000",
				"language": "Russian",
				"publicLawNumber": "94.08-99",
				"url": "http://docs.cntd.ru/document/1200043175",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ТР 94.08-99 Технический регламент операционного контроля качества строительно-монтажных и специальных работ при возведении зданий и сооружений. 08. Устройство гидроизоляции подземной части здания\",\"Номер документа\":\"94.08-99\",\"Вид документа\":\"ТР (Технический регламент)\",\"Принявший орган\":\"Руководитель Комплекса архитектуры, строительства, развития и реконструкции города\",\"Статус\":\"Действующий\",\"Опубликован\":\"/ Правительство Москвы; Комплекс архитектуры, строительства, развития и реконструкции города. - М., 2000 год\",\"Дата принятия\":\"30 июня 2000\",\"Дата начала действия\":\"30 июня 2000\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ТР 94.08-99 Технический регламент операционного контроля качества строительно-монтажных и специальных работ при возведении зданий и сооружений. 08. Устройство гидроизоляции подземной части здания</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>94.08-99</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>ТР (Технический регламент)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Руководитель Комплекса архитектуры, строительства, развития и реконструкции города</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>/ Правительство Москвы; Комплекс архитектуры, строительства, развития и реконструкции города. - М., 2000 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>30 июня 2000</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>30 июня 2000</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/551620626",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Правила безопасности в производстве растительных масел методом прессования и экстракции",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Ростехнадзор",
						"creatorType": "author"
					}
				],
				"dateEnacted": "6/14/2019",
				"code": "ФНП (Федеральные нормы и правила)",
				"codeNumber": "Приказ",
				"extra": "CNTDID: 551620626\nPublished: Официальный интернет-портал правовой информации www.pravo.gov.ru, 14.12.2018, N 0001201812140019\ndateEnactedOriginal: 6/14/2019\ndateApproved: 11/08/2018",
				"language": "Russian",
				"publicLawNumber": "538",
				"section": "ФНП в области промышленной безопасности",
				"url": "http://docs.cntd.ru/document/551620626",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Об утверждении Федеральных норм и правил в области промышленной безопасности \\\"Правила безопасности в производстве растительных масел методом прессования и экстракции\\\"\",\"Номер документа\":\"538\",\"Вид документа\":\"Приказ Ростехнадзора\nФНП в области промышленной безопасности\",\"Принявший орган\":\"Ростехнадзор\",\"Статус\":\"Действующий\",\"Опубликован\":\"Официальный интернет-портал правовой информации www.pravo.gov.ru, 14.12.2018, N 0001201812140019\",\"Дата принятия\":\"08 ноября 2018\",\"Дата начала действия\":\"14 июня 2019\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Об утверждении Федеральных норм и правил в области промышленной безопасности \"Правила безопасности в производстве растительных масел методом прессования и экстракции\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>538</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Приказ Ростехнадзора<br>ФНП в области промышленной безопасности</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Ростехнадзор</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальный интернет-портал правовой информации www.pravo.gov.ru, 14.12.2018, N 0001201812140019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>08 ноября 2018</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>14 июня 2019</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/420215595",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Безопасность при обращении с радиоактивными отходами. Общие положения (с изменениями на 22 ноября 2018 года)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Ростехнадзор",
						"creatorType": "author"
					}
				],
				"dateEnacted": "11/22/2018",
				"code": "ФНП (Федеральные нормы и правила)",
				"codeNumber": "Приказ",
				"extra": "CNTDID: 420215595\nPublished: Российская газета, N 24/1, 06.02.2015, (специальный выпуск)\ndateEnactedOriginal: 2/17/2015\ndateApproved: 8/05/2014",
				"language": "Russian",
				"publicLawNumber": "347 ## НП-058-14",
				"section": "ФНП в области использования атомной энергии",
				"url": "http://docs.cntd.ru/document/420215595",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Об утверждении федеральных норм и правил в области использования атомной энергии \\\"Безопасность при обращении с радиоактивными отходами. Общие положения\\\" (с изменениями на 22 ноября 2018 года)\",\"Номер документа\":\"347\nНП-058-14\",\"Вид документа\":\"Приказ Ростехнадзора\nФНП в области использования атомной энергии\",\"Принявший орган\":\"Ростехнадзор\",\"Статус\":\"Действующий\",\"Опубликован\":\"Российская газета, N 24/1, 06.02.2015, (специальный выпуск)\",\"Дата принятия\":\"05 августа 2014\",\"Дата начала действия\":\"17 февраля 2015\",\"Дата редакции\":\"22 ноября 2018\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Об утверждении федеральных норм и правил в области использования атомной энергии \"Безопасность при обращении с радиоактивными отходами. Общие положения\" (с изменениями на 22 ноября 2018 года)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>347<br>НП-058-14</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Приказ Ростехнадзора<br>ФНП в области использования атомной энергии</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Ростехнадзор</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 24/1, 06.02.2015, (специальный выпуск)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>05 августа 2014</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>17 февраля 2015</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>22 ноября 2018</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/902289182",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Общие положения обеспечения безопасности исследовательских ядерных установок",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Ростехнадзор",
						"creatorType": "author"
					}
				],
				"dateEnacted": "9/13/2011",
				"code": "ФНП (Федеральные нормы и правила)",
				"codeNumber": "Приказ",
				"extra": "CNTDID: 902289182\nPublished: Российская газета, N 195, 02.09.2011\ndateEnactedOriginal: 9/13/2011\ndateApproved: 6/30/2011",
				"language": "Russian",
				"publicLawNumber": "348 ## НП-033-11",
				"section": "ФНП в области использования атомной энергии",
				"url": "http://docs.cntd.ru/document/902289182",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Об утверждении и введении в действие федеральных норм и правил в области использования атомной энергии \\\"Общие положения обеспечения безопасности исследовательских ядерных установок\\\"\",\"Номер документа\":\"348\nНП-033-11\",\"Вид документа\":\"Приказ Ростехнадзора\nФНП в области использования атомной энергии\",\"Принявший орган\":\"Ростехнадзор\",\"Статус\":\"Действующий\",\"Опубликован\":\"Российская газета, N 195, 02.09.2011\",\"Дата принятия\":\"30 июня 2011\",\"Дата начала действия\":\"13 сентября 2011\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Об утверждении и введении в действие федеральных норм и правил в области использования атомной энергии \"Общие положения обеспечения безопасности исследовательских ядерных установок\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>348<br>НП-033-11</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Приказ Ростехнадзора<br>ФНП в области использования атомной энергии</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Ростехнадзор</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Российская газета, N 195, 02.09.2011</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>30 июня 2011</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>13 сентября 2011</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200034640",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Установки по переработке отработавшего ядерного топлива. Требования безопасности",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Госатомнадзор России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "9/01/2000",
				"code": "ФНП (Федеральные нормы и правила)",
				"codeNumber": "Постановление",
				"extra": "CNTDID: 1200034640\nPublished: официальное издание ## Вестник Госатомнадзора России, N 3(9), 2000 год\ndateEnactedOriginal: 9/01/2000\ndateApproved: 12/27/1999",
				"language": "Russian",
				"publicLawNumber": "НП-013-99 ## 5",
				"section": "ФНП в области использования атомной энергии",
				"url": "http://docs.cntd.ru/document/1200034640",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"НП-013-99 Установки по переработке отработавшего ядерного топлива. Требования безопасности\",\"Номер документа\":\"5\nНП-013-99\",\"Вид документа\":\"Постановление Госатомнадзора России\nФНП в области использования атомной энергии\",\"Принявший орган\":\"Госатомнадзор России\",\"Статус\":\"Действующий\",\"Опубликован\":\"официальное издание\nВестник Госатомнадзора России, N 3(9), 2000 год\",\"Дата принятия\":\"27 декабря 1999\",\"Дата начала действия\":\"01 сентября 2000\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>НП-013-99 Установки по переработке отработавшего ядерного топлива. Требования безопасности</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>5<br>НП-013-99</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Госатомнадзора России<br>ФНП в области использования атомной энергии</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Госатомнадзор России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>официальное издание<br>Вестник Госатомнадзора России, N 3(9), 2000 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>27 декабря 1999</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 сентября 2000</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/564138843",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Типовые технические требования к трансформаторам, автотрансформаторам  (распределительным, силовым)классов напряжения 110-750 кВ",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "ПАО \"ФСК ЕЭС\"",
						"creatorType": "author"
					}
				],
				"dateEnacted": "12/20/2019",
				"codeNumber": "СТО, Стандарт организации",
				"extra": "CNTDID: 564138843\nPublished: Сайт Федеральной сетевой компании Единой энергетической системы (ФСК ЕЭС) www.fsk-ees.ru по состоянию на 15.01.2020\ndateEnactedOriginal: 12/20/2019\ndateApproved: 12/20/2019",
				"language": "Russian",
				"publicLawNumber": "56947007-29.180.01.275-2019",
				"url": "http://docs.cntd.ru/document/564138843",
				"attachments": [],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СТО 56947007-29.180.01.275-2019 Типовые технические требования к трансформаторам, автотрансформаторам  (распределительным, силовым)классов напряжения 110-750 кВ\",\"Номер документа\":\"56947007-29.180.01.275-2019\",\"Вид документа\":\"СТО, Стандарт организации\",\"Принявший орган\":\"ПАО \\\"ФСК ЕЭС\\\"\",\"Статус\":\"Действующий\",\"Опубликован\":\"Сайт Федеральной сетевой компании Единой энергетической системы (ФСК ЕЭС) www.fsk-ees.ru по состоянию на 15.01.2020\",\"Дата принятия\":\"20 декабря 2019\",\"Дата начала действия\":\"20 декабря 2019\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СТО 56947007-29.180.01.275-2019 Типовые технические требования к трансформаторам, автотрансформаторам  (распределительным, силовым)классов напряжения 110-750 кВ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>56947007-29.180.01.275-2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СТО, Стандарт организации</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>ПАО \"ФСК ЕЭС\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Сайт Федеральной сетевой компании Единой энергетической системы (ФСК ЕЭС) www.fsk-ees.ru по состоянию на 15.01.2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>20 декабря 2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>20 декабря 2019</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/564468768",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Процессы выполнения работ по подготовке проектной документации. Основные положения. Внутренние системы газоснабжения технологических установок, котельных и малых теплоэлектроцентралей",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "НОПРИЗ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "1/01/2020",
				"codeNumber": "СТО, Стандарт организации",
				"extra": "CNTDID: 564468768\nPublished: Межотраслевое объединение работодателей (Ноприз) http://nopriz.ru по состоянию на 17.03.2020\ndateEnactedOriginal: 1/01/2020\ndateApproved: 9/17/2019",
				"language": "Russian",
				"publicLawNumber": "П-020-2019",
				"url": "http://docs.cntd.ru/document/564468768",
				"attachments": [],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СТО НОПРИЗ П-020-2019 Процессы выполнения работ по подготовке проектной документации. Основные положения. Внутренние системы газоснабжения технологических установок, котельных и малых теплоэлектроцентралей\",\"Номер документа\":\"П-020-2019\",\"Вид документа\":\"СТО, Стандарт организации\",\"Статус\":\"Действующий\",\"Опубликован\":\"Межотраслевое объединение работодателей (Ноприз) http://nopriz.ru по состоянию на 17.03.2020\",\"Дата принятия\":\"17 сентября 2019\",\"Дата начала действия\":\"01 января 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СТО НОПРИЗ П-020-2019 Процессы выполнения работ по подготовке проектной документации. Основные положения. Внутренние системы газоснабжения технологических установок, котельных и малых теплоэлектроцентралей</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>П-020-2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СТО, Стандарт организации</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Межотраслевое объединение работодателей (Ноприз) http://nopriz.ru по состоянию на 17.03.2020</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>17 сентября 2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 января 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/552484101",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Музеи. Отопление, вентиляция, кондиционирование воздуха",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "НП \"АВОК\"",
						"creatorType": "author"
					}
				],
				"dateEnacted": "8/15/2018",
				"codeNumber": "СТО, Стандарт организации",
				"extra": "CNTDID: 552484101\nPublished: М,: НП \"АВОК\", 2018 год\ndateEnactedOriginal: 8/15/2018\ndateApproved: 8/15/2018",
				"language": "Russian",
				"publicLawNumber": "7.7-2018",
				"section": "НП \"АВОК\"",
				"url": "http://docs.cntd.ru/document/552484101",
				"attachments": [],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СТО НП \\\"АВОК\\\" 7.7-2018 Музеи. Отопление, вентиляция, кондиционирование воздуха\",\"Номер документа\":\"7.7-2018\",\"Вид документа\":\"СТО, Стандарт организации\",\"Принявший орган\":\"НП \\\"АВОК\\\"\",\"Опубликован\":\"М,: НП \\\"АВОК\\\", 2018 год\",\"Дата принятия\":\"15 августа 2018\",\"Дата начала действия\":\"15 августа 2018\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СТО НП \"АВОК\" 7.7-2018 Музеи. Отопление, вентиляция, кондиционирование воздуха</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>7.7-2018</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СТО, Стандарт организации</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>НП \"АВОК\"</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>М,: НП \"АВОК\", 2018 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>15 августа 2018</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>15 августа 2018</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/564068890",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Производство алюминия",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"dateEnacted": "3/01/2020",
				"codeNumber": "Информационно-технический справочник по наилучшим доступным технологиям",
				"extra": "CNTDID: 564068890\nPublished: Официальный сайт Росстандарта www.gost.ru по состоянию на 27.12.2019\ndateEnactedOriginal: 3/01/2020\ndateApproved: 12/12/2019",
				"language": "Russian",
				"publicLawNumber": "11-2019",
				"url": "http://docs.cntd.ru/document/564068890",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"ИТС 11-2019 Производство алюминия\",\"Номер документа\":\"11-2019\",\"Вид документа\":\"Информационно-технический справочник по наилучшим доступным технологиям\",\"Принявший орган\":\"Росстандарт\",\"Статус\":\"Действующий\",\"Опубликован\":\"Официальный сайт Росстандарта www.gost.ru по состоянию на 27.12.2019\",\"Дата принятия\":\"12 декабря 2019\",\"Дата начала действия\":\"01 марта 2020\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>ИТС 11-2019 Производство алюминия</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>11-2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Информационно-технический справочник по наилучшим доступным технологиям</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Росстандарт</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Официальный сайт Росстандарта www.gost.ru по состоянию на 27.12.2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>12 декабря 2019</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 марта 2020</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/902243701",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О безопасности сетей газораспределения и газопотребления (с изменениями на 14 декабря 2018 года)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Правительство РФ",
						"creatorType": "author"
					}
				],
				"dateEnacted": "12/14/2018",
				"code": "ТР (Технический регламент)",
				"codeNumber": "ТР (Технический регламент)",
				"extra": "CNTDID: 902243701\nPublished: Собрание законодательства Российской Федерации, N 45, 08.11.2010, ст.5853\ndateEnactedOriginal: 11/08/2011\ndateApproved: 10/29/2010",
				"language": "Russian",
				"publicLawNumber": "870",
				"url": "http://docs.cntd.ru/document/902243701",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Об утверждении технического регламента о безопасности сетей газораспределения и газопотребления (с изменениями на 14 декабря 2018 года)\",\"Номер документа\":\"870\",\"Вид документа\":\"Постановление Правительства РФ\nТехнический регламент\",\"Принявший орган\":\"Правительство РФ\",\"Статус\":\"Действующий\",\"Опубликован\":\"Собрание законодательства Российской Федерации, N 45, 08.11.2010, ст.5853\",\"Дата принятия\":\"29 октября 2010\",\"Дата начала действия\":\"08 ноября 2011\",\"Дата редакции\":\"14 декабря 2018\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Об утверждении технического регламента о безопасности сетей газораспределения и газопотребления (с изменениями на 14 декабря 2018 года)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>870</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Правительства РФ<br>Технический регламент</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Правительство РФ</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Собрание законодательства Российской Федерации, N 45, 08.11.2010, ст.5853</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>29 октября 2010</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>08 ноября 2011</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>14 декабря 2018</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/902206841",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Требования к безопасности продуктов детского, диетического и лечебно-профилактического питания",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Правительство Республики Казахстан",
						"creatorType": "author"
					}
				],
				"dateEnacted": "7/01/2010",
				"code": "ТР (Технический регламент)",
				"codeNumber": "ТР (Технический регламент)",
				"extra": "CNTDID: 902206841\nPublished: Собрание законодательства Российской Федерации, N 11, 15.03.2010, ст.1221\ndateEnactedOriginal: 7/01/2010\ndateApproved: 5/04/2008",
				"language": "Russian",
				"publicLawNumber": "411",
				"url": "http://docs.cntd.ru/document/902206841",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"Об утверждении технического регламента \\\"Требования к безопасности продуктов детского, диетического и лечебно-профилактического питания\\\"\",\"Номер документа\":\"411\",\"Вид документа\":\"Постановление Правительства Республики Казахстан\nТехнический регламент\",\"Принявший орган\":\"Правительство Республики Казахстан\",\"Опубликован\":\"Собрание законодательства Российской Федерации, N 11, 15.03.2010, ст.1221\",\"Дата принятия\":\"04 мая 2008\",\"Дата начала действия\":\"01 июля 2010\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>Об утверждении технического регламента \"Требования к безопасности продуктов детского, диетического и лечебно-профилактического питания\"</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>411</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>Постановление Правительства Республики Казахстан<br>Технический регламент</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Правительство Республики Казахстан</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>Собрание законодательства Российской Федерации, N 11, 15.03.2010, ст.1221</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>04 мая 2008</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 июля 2010</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200019270",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Проектирование систем противопожарной защиты резервуарных парков Госкомрезерва России",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Госкомрезерв России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "11/13/1998",
				"code": "СП (Свод правил)",
				"codeNumber": "СП (Свод правил)",
				"extra": "CNTDID: 1200019270\nPublished: официальное издание ## М., 1998 год\ndateEnactedOriginal: 11/13/1998\ndateApproved: 11/13/1998",
				"language": "Russian",
				"publicLawNumber": "21-104-98",
				"url": "http://docs.cntd.ru/document/1200019270",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СП 21-104-98 Проектирование систем противопожарной защиты резервуарных парков Госкомрезерва России\",\"Номер документа\":\"21-104-98\",\"Вид документа\":\"СП (Свод правил)\",\"Принявший орган\":\"Госкомрезерв России\",\"Статус\":\"Действующий\",\"Опубликован\":\"официальное издание\nМ., 1998 год\",\"Дата принятия\":\"13 ноября 1998\",\"Дата начала действия\":\"13 ноября 1998\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СП 21-104-98 Проектирование систем противопожарной защиты резервуарных парков Госкомрезерва России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>21-104-98</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СП (Свод правил)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Госкомрезерв России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>официальное издание<br>М., 1998 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>13 ноября 1998</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>13 ноября 1998</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/871001022",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Пожарная безопасность зданий и сооружений (с Изменениями N 1, 2)",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Минстрой России",
						"creatorType": "author"
					}
				],
				"dateEnacted": "7/19/2002",
				"code": "СП (Свод правил)",
				"codeNumber": "СНиП",
				"extra": "CNTDID: 871001022\nPublished: официальное издание ## Госстрой России. - М.: ГУП ЦПП, 2002 год\ndateEnactedOriginal: 1/01/1998\ndateApproved: 2/13/1997",
				"language": "Russian",
				"publicLawNumber": "21-01-97 ## 112.13330.2011",
				"url": "http://docs.cntd.ru/document/871001022",
				"attachments": [
					{
						"title": "Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [
					"{\"Название документа\":\"СНиП 21-01-97* Пожарная безопасность зданий и сооружений (с Изменениями N 1, 2)\",\"Номер документа\":\"21-01-97\n112.13330.2011\",\"Вид документа\":\"СНиП\nСП (Свод правил)\",\"Принявший орган\":\"Минстрой России\",\"Статус\":\"Действующий\",\"Опубликован\":\"официальное издание\nГосстрой России. - М.: ГУП ЦПП, 2002 год\",\"Дата принятия\":\"13 февраля *1997\n13 февраля 1997\",\"Дата начала действия\":\"01 января 1998\",\"Дата редакции\":\"19 июля 2002\"}",
					"<table class=\"status\"><tbody>\n    <tr>\n        <td class=\"first-td\">Название документа</td>\n        <td>СНиП 21-01-97* Пожарная безопасность зданий и сооружений (с Изменениями N 1, 2)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Номер документа</td>\n        <td>21-01-97<br>112.13330.2011</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Вид документа</td>\n        <td>СНиП<br>СП (Свод правил)</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Принявший орган</td>\n        <td>Минстрой России</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Статус</td>\n        <td>Действующий</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Опубликован</td>\n        <td>официальное издание<br>Госстрой России. - М.: ГУП ЦПП, 2002 год</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата принятия</td>\n        <td>13 февраля *1997<br>13 февраля 1997</td>\n    </tr>\n    <tr>\n        <td class=\"first-td\">Дата начала действия</td>\n        <td>01 января 1998</td>\n    </tr>\n    \n    <tr>\n        <td class=\"first-td\">Дата редакции</td>\n        <td>19 июля 2002</td>\n    </tr>\n</tbody></table>"
				],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
