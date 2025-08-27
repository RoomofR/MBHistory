import { serve } from "bun";
import type { Serve } from "bun";
import { Database } from "bun:sqlite";
import { error } from "console";

const whitelist_text = await Bun.file("whitelist.txt").text();
const Whitelisted_Item_Ids: Array<number> = whitelist_text
	.split(/\r?\n/)
	.map(line => line.trim())
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

//const server = serve(server_options);
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

import {SaleHistoryResponseSchema, type SaleHistoryResponse, type ItemEntry, type SaleHistoryEntry} from "./schemas/SaleHistoryResponce";

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

async function checkForUpdatedMBData(){
	//Checks if itemstamp is old for the given item id, then update with new
	const checkAndUpdateLastUploadTime = db.query(`
		INSERT INTO last_updated (item_id, timestamp)
		VALUES (?, ?)
		ON CONFLICT(item_id) DO UPDATE
			SET timestamp = excluded.timestamp
			WHERE excluded.timestamp > last_updated.timestamp
	`);
	
	//Check if a single latest entry needs an update
	const singleHistoryFetch = await fetchSaleHistory({
		item_ids: Whitelisted_Item_Ids,
		entries: 1
	});

	let item_ids_to_update: Array<number> = [];
	for(let item_id of Whitelisted_Item_Ids){
		let item_entry = singleHistoryFetch.items[item_id];
		let lastUploadTime:number = item_entry?.lastUploadTime || 0;

		let db_result = checkAndUpdateLastUploadTime.run(item_id, lastUploadTime);
		let has_update:boolean = db_result.changes > 0;

		console.log(item_id, new Date(lastUploadTime).toISOString(), has_update);

		if(has_update){
			item_ids_to_update.push(item_id);
		}

	}

	//With all the new time stamps for the new items, update all entries by fetching the max history
	const multiHistoryFetch = await fetchSaleHistory({
		item_ids: item_ids_to_update,
		entries: 99999
	});

	const insertSaleEntryStatment = db.prepare(`
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

	const insertMany = db.transaction((entries: {
		item_id: number,
		hq: boolean,
		pricePerUnit: number,
		quantity: number,
		timestamp: number,
		worldID: number,
		hash: string
	}[]) => {
		for(const e of entries){
			insertSaleEntryStatment.run(
				e.item_id,
				e.hq ? 1 : 0,
				e.pricePerUnit,
				e.quantity,
				e.timestamp,
				e.worldID,
				e.hash
			);
		}
		return entries.length;
	});

	for(let item_id of item_ids_to_update){
		let item_entry = multiHistoryFetch.items[item_id];

		if (!item_entry) throw new Error(`No entry found for item ${item_id}`);

		let sale_entries: Array<SaleHistoryEntry> = item_entry.entries;

		let formatted_entries = sale_entries.map(sale => ({
			item_id,
			hq: sale.hq,
			pricePerUnit: sale.pricePerUnit,
			quantity: sale.quantity,
			timestamp: sale.timestamp,
			worldID: sale.worldID,
			hash: saleHash(item_id, sale.timestamp, sale.buyerName, sale.pricePerUnit * sale.quantity)
		}));

		let transaction_result = insertMany(formatted_entries);

		console.log(transaction_result)
	}
}

await checkForUpdatedMBData();