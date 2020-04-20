{
	"translatorID": "2281396d-1c23-4065-9dcd-5040e0e5de6c",
	"label": "a a Garant",
	"creator": "PChemGuy",
	"target": "https?://ivo.garant.ru/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-04-20 23:10:44"
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

/*
	Search interfaces:
	GET http://www.consultant.ru/search/?q=<QUERY>
	GET http://www.consultant.ru/cons/cgi/online.cgi?req=card&page=splus&splusFind=<QUERY>
	
	Individual documents
	TOC:	http://www.consultant.ru/document/cons_doc_LAW_<DOC_ID1>
	Full:		http://www.consultant.ru/cons/cgi/online.cgi?req=doc&base=<DB>&n=<DOC_ID2>
		DB=LAW	http://www.consultant.ru/cons/cgi/online.cgi?req=doc&base=LAW&n=<DOC_ID2>
		DB=EXP	http://www.consultant.ru/cons/cgi/online.cgi?req=doc&base=EXP&n=<DOC_ID2>
		Other DBs appear to be only available via subscription
	The first interface may only be available for a subset of the database.
	
	Full text:
	GET http://www.consultant.ru/cons/cgi/online.cgi?req=export&type=<TYPE>&base=<DB>&n=<DOC_ID2>
	type: pdf rtf html
	Example: http://www.consultant.ru/cons/cgi/online.cgi?req=export&type=pdf&base=LAW&n=349217
	
	=======================================================================================
	
	Search results for http://www.consultant.ru/cons/cgi/online.cgi?req=card&page=splus&splusFind=<QUERY>
	Table CSS:		"div.listPaneContent"
	Href items: 	"div.listPaneContent > div.row > a"
	Doc details:	"div.listPaneContent > div.row > a > div > div.content.adts > div.extraText > div.text"
*/
