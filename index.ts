import type { Serve } from "bun";
import { Database, Statement } from "bun:sqlite";
import { error } from "console";

const whitelist_text = await Bun.file("whitelist.ini").text();
const Whitelisted_Item_Ids: number[] = whitelist_text
	.split(/\r?\n/)
	.map(line => line.split("#")[0]!.trim())
	.filter(line => line && !line.startsWith("#"))
	.map(Number);

const ENV = process.env.BUILD;
const PORT = ENV === "PROD" ? 443 : Number(process.env.PORT);

const server_options: Serve = {
	port: PORT,
	fetch(req: any): Response{
		return new Response("Bun!");
	},
	tls: undefined,
}

//ADD TLS if on production
if(ENV === "PROD"){
	server_options.tls = {
		key: Bun.file(process.env.TLS_KEY_PATH!),
    	cert: Bun.file(process.env.TLS_CERT_PATH!),
	}
}

//const server = bun.serve(server_options);
//console.log(`Running as ${ENV} and Listening on localhost:${server.port}`);

//Fetches json from url and parses/returns a json object
async function fetchJSON<T>(url: string): Promise<T>{
	try{
		const res = await fetch(url);
		if(!res.ok){
			throw new Error(`Request failed: ${res.status}`);
		}
		const json = await res.json();
		return json as T;

	}catch (err){
		console.error("Fetch error:", err);
		throw err;
	}
}

type SalesOptions = {
	item_ids: Array<number>,
	server?: string, //europe/light/lich/etc
	entries?: number, //0-99999 default=1800
}

import {SaleHistoryResponseSchema, type SaleHistoryResponse, type ItemEntry, type SaleHistoryEntry} from "./schemas/SaleHistoryResponse";

async function fetchSaleHistory({
	item_ids = [],
	server = "europe",
	entries = 1,
}: SalesOptions): Promise<SaleHistoryResponse>{
	if(item_ids.length <= 0)throw error("Empty item ids array!");
	entries = Math.max(Math.min(entries, 99999), 1);
	console.log(`Fetching History:\n- ${item_ids.join(',')}\n- From ${server} with ${entries} entries`);
	const url:string = `https://universalis.app/api/v2/history/${server}/${item_ids.join(",")}?entriesToReturn=${entries}&minSalePrice=0&maxSalePrice=2147483647`;
	const mb_history_data = await fetchJSON(url);
	return SaleHistoryResponseSchema.parse(mb_history_data);
}


const db = new Database("marketboard_data.sqlite", { create: true });

//Item last updated Table
db.exec(`
	CREATE TABLE IF NOT EXISTS last_updated (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		item_id INTEGER UNIQUE NOT NULL,
		timestamp INTEGER UNIQUE NOT NULL
	);
`);

//Item Sale History Table
db.exec(`
	CREATE TABLE IF NOT EXISTS sale_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		item_id INTEGER NOT NULL,
		hq BOOLEAN NOT NULL,
		price_per_unit INTEGER NOT NULL,
		quantity INTEGER NOT NULL,
		timestamp INTEGER NOT NULL,
		world_id INTEGER NOT NULL,
		hash TEXT NOT NULL UNIQUE,
		aggregated BOOLEAN NOT NULL DEFAULT 0
	);
`);

function truncatedMD5(input: string, length: number = 12): string {
	const hasher = new Bun.CryptoHasher("md5");
	hasher.update(input);
	const hex = Buffer.from(hasher.digest()).toString("hex");
	return hex.slice(0, length);
}

function saleHash(item_id: number, timestamp: number, buyer_name: string, total_price: number): string {
  return truncatedMD5(`${item_id}|${timestamp}|${buyer_name}|${total_price}`);
}
// --- DB Helpers ---
const LastUploadTimeStatement: Statement = db.query(`
	INSERT INTO last_updated (item_id, timestamp)
	VALUES (?, ?)
	ON CONFLICT(item_id) DO UPDATE
		SET timestamp = excluded.timestamp
		WHERE excluded.timestamp > last_updated.timestamp
`);
const InsertSaleEntryStatement: Statement = db.prepare(`
	INSERT INTO sale_history (
		item_id,
		hq,
		price_per_unit,
		quantity,
		timestamp,
		world_id,
		hash
	) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(hash) DO NOTHING
`);
const InsertManyTransaction = db.transaction((entries: {
		item_id: number,
		hq: boolean,
		pricePerUnit: number,
		quantity: number,
		timestamp: number,
		worldID: number,
		hash: string
	}[]) => {
		let inserted = 0;
		for (const e of entries) {
			const result = InsertSaleEntryStatement.run(
				e.item_id,
				e.hq ? 1 : 0,
				e.pricePerUnit,
				e.quantity,
				e.timestamp,
				e.worldID,
				e.hash
			);
			inserted += result.changes;
		}
		return inserted;
});

// --- Logic Helpers ---
async function findItemsNeedingUpdate(whitelist: number[]): Promise<number[]> {
	const singleHistoryFetch = await fetchSaleHistory({
		item_ids: whitelist,
		entries: 1
	});

	let itemsToUpdate: number[] = [];

	for (let item_id of whitelist) {
		const entry = singleHistoryFetch.items[item_id];
		const lastUploadTime: number = entry?.lastUploadTime || 0;

		const db_result = LastUploadTimeStatement.run(item_id, lastUploadTime);
		const hasUpdate = db_result.changes > 0;

		console.log(item_id, new Date(lastUploadTime).toISOString(), hasUpdate);

		if (hasUpdate) {
			itemsToUpdate.push(item_id);
		}
	}

	return itemsToUpdate;
}

function formatSaleEntries(item_id: number, saleEntries: SaleHistoryEntry[]) {
	return saleEntries.map(sale => ({
		item_id,
		hq: sale.hq,
		pricePerUnit: sale.pricePerUnit,
		quantity: sale.quantity,
		timestamp: sale.timestamp,
		worldID: sale.worldID,
		hash: saleHash(
			item_id,
			sale.timestamp,
			sale.buyerName,
			sale.pricePerUnit * sale.quantity
		)
	}));
}

//--- Main ---
async function checkAndUpdateMBData(){
	//Check for which items to update by getting only 1 query from history
	const itemsToUpdate: number[] = await findItemsNeedingUpdate(Whitelisted_Item_Ids);

	if (itemsToUpdate.length === 0) {
		console.log("No updates needed.");
		return;
	}

	//Get full history of items that need updating, and insert them into sale_history table
	const multiHistoryFetch = await fetchSaleHistory({
		item_ids: itemsToUpdate,
		entries: 99999
	});

	let total_insertions: number = 0;
	for (let item_id of itemsToUpdate) {
		const itemEntry = multiHistoryFetch.items[item_id];
		if (!itemEntry) throw new Error(`No entry found for item ${item_id}`);

		const formattedEntries = formatSaleEntries(item_id, itemEntry.entries);
		const insertedCount = InsertManyTransaction(formattedEntries);

		console.log(`Inserted ${insertedCount} entries for item ${item_id}`);
		total_insertions += insertedCount;
	}
	console.log(`${total_insertions} total entries added to sale history database`);
}
//await checkAndUpdateMBData();