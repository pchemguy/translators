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
	"lastUpdated": "2020-04-21 01:22:17"
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
		POST http://ivo.garant.ru/search/advanced/run
			Search results: http://ivo.garant.ru/#/advancedsearch/
		GET http://ivo.garant.ru/#/basesearch/<QUERY>
			items:		"div.wrapper > div.wrapperInner > ul > li > a" - href
			details:	"div.wrapper > div.wrapperInner > ul > li > a > div > p"
			
	Individual documents
		http://ivo.garant.ru/#/document/<DOC_ID>
		Metadata:
			selector:	"div.x-component.title.x-box-item.x-component-default"
			attribute:	"data-qtip"
			
	Full text (RTF):
	http://ivo.garant.ru/document/rtf?id=<DOC_ID>
*/
