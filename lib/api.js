'use strict';

class PFQAPI {
	constructor() {
		this.ready = PFQAPI.ready || (PFQAPI.ready = PFQAPI.#loadApiKey());
	}

	// #region Tests
	/** @returns {Promise<{status:"ok"}>} */
	async test() {
		return PFQAPI.#request("/health");
	}

	// #region User
	/**
	 * Get the current user's profile.
	 * 
	 * **Rate limit:** 10 requests per minute
	 * @returns {Promise<{
	 *  name: string,
	 *  displayname: string,
	 *  isStaff: boolean,
	 *  shortlink: string
	 * }>}
	 */
	async whoami() {
		return PFQAPI.#request("/user/me");
	}

	/**
	 * Get the current user's Wishforge badges.
	 * 
	 * @returns {Promise<Map<string,string>>} Map of type to name
	 */
	async badges() {
		return new Map((await PFQAPI.#request("/user/badges")).badges.map(badge=>[badge.type,badge.name]));
	}

	/**
	 * Get various boosts related to shiny/albino/melan hunting.
	 * @returns {Promise<{
	 *  hypermode: boolean,
	 *  silverAmulet: boolean,
	 *  goldAmulet: boolean,
	 *  cobaltAmulet: boolean,
	 *  shinyCharm: boolean,
	 *  shinyChainName: string,
	 *  shinyChainCount: number,
	 *  shinyChainMiniCount: number,
	 *  shinyChainForme: string,
	 *  uberCharm: boolean,
	 *  typeRace: boolean,
	 *  albinoLevel: number,
	 *  zCrystal: boolean,
	 *  seiPower: number,
	 *  potd: boolean
	 * }>}
	 */
	async boosts() {
		return (await PFQAPI.#request("/user/boosts")).boosts;
	}

	/**
	 * Get a user's Gem counts.
	 * @returns {Promise<Map<string,number>>}
	 */
	async gems() {
		return new Map((await PFQAPI.#request("/user/inventory/gems")).gems.map(gem=>[gem.name,gem.quantity]));
	}

	/**
	 * Get the user's currency.
	 * @returns {Promise<{
	 *  credits: number,
	 *  gold: number,
	 *  zophan: number
	 * }>}
	 */
	async currency() {
		return (await PFQAPI.#request("/user/inventory/currency")).currency;
	}

	/**
	 * Get the user's Type Race rotation.
	 * 
	 * The currently active type is tagged, eg. `fire [active]`
	 * @returns {Promise<string[]>}
	 */
	async #fetchTyperaceRotation() {
		// get from localstorage if possible
		if( $.USER+".api.typeracerotation" in localStorage ) {
			const cached = JSON.parse(localStorage[$.USER+".api.typeracerotation"]);
			if( cached.timestamp > Date.now() ) {
				return cached.rotation;
			}
		}
		const rotation = (await PFQAPI.#request("/user/typerace/rotation")).rotation;
		// cache until start of next month
		const expires = new Date();
		expires.setUTCMonth(expires.getUTCMonth()+1, 1);
		expires.setUTCHours(0,0,0,0);
		localStorage[$.USER+".api.typeracerotation"] = JSON.stringify({timestamp: expires.getTime(), rotation});
		return rotation;
	}

	/**
	 * Get the user's Type Race rotation.
	 * @returns {Promise<string[]>}
	 */
	async typeraceRotation() {
		const rotation = await this.#fetchTyperaceRotation();
		// remove the [active] tag
		rotation.forEach((type,i)=>rotation[i] = type.replace(" [active]",""));
		return rotation;
	}

	/**
	 * Get the user's current Type Race team.
	 * @returns {Promise<string>}
	 */
	async typeraceTeam() {
		const rotation = await this.typeraceRotation();
		// find the active type
		const active = rotation.find(type=>type.includes(" [active]"));
		// remove the [active] tag
		return active.replace(" [active]","");
	}

	// #region Pokemon
	/**
	 * Get an Egg sprite from a Summary link.
	 * @param {string} summary Just the ID part of the summary link.
	 * @returns {Promise<string|null>}
	 */
	async eggSprite(summary) {
		const sprite = (await PFQAPI.#request(`/pokemon/egg-sprite?summary=${summary}`)).sprite;
		return sprite ? `https://static.pokefarm.com/img/pkmn/${sprite}` : null;
	}

	/**
	 * Get IV stats for a Pokémon
	 * @param {string} summary Just the ID part of the summary link.
	 * @returns {Promise<[
	 *  hp: number,
	 *  atk: number,
	 *  def: number,
	 *  sat: number,
	 *  sdf: number,
	 *  spd: number
	 * ]>}
	 */
	async ivs(summary) {
		return (await PFQAPI.#request(`/pokemon/iv?shortlink=${summary}`)).iv;
	}

	/**
	 * Get all IV stats for all Pokémon.
	 * 
	 * Usage: `for await (const [shortlink, iv] of api.allIvs()) { ... }`
	 * @returns {AsyncGenerator<[shortlink: string, iv: {
	 *  hp: number,
	 *  atk: number,
	 *  def: number,
	 *  sat: number,
	 *  sdf: number,
	 *  spd: number
	 * }]>}
	 */
	async *allIvs() {
		let pageNumber = 1;
		while(true) {
			const page = await PFQAPI.#request(`/pokemon/all-iv?page=${pageNumber}`);
			if( !page.ivs.length ) {
				break;
			}
			for( const entry of page.ivs ) {
				yield [entry.shortlink, entry.iv];
			}
			pageNumber++;
			if( pageNumber > page.pagination.totalPages ) {
				break;
			}
		}
	}

	/**
	 * Get the Pokedex.
	 * 
	 * **Rate limit:** 10 requests per minute
	 * @returns {Promise<Map<string,{name:string,formename:string,sprite:string,region:string}>>}
	 * Map of formeid to entry
	 */
	async pokedex() {
		/** @type {{region_name:string,pokemon:{formeid:string,name:string,formename:string,sprite:string}[]}[]} */
		const dex = await PFQAPI.#request("/pokemon/dex");
		const map = new Map();
		for( const {region_name,pokemon} of dex ) {
			for( const entry of pokemon ) {
				const region = region_name + (region_name === 'PokéFarm Q'
					? (parseInt(entry.formeid,10) === 0
						? ' (Exclusives)'
						: (
							entry.formeid.match(/-Q$/)
							? ' (Megas)'
							: ' (Variants)'
						)
					)
					: ''
				);
				map.set(entry.formeid, {
					name: entry.name,
					formename: entry.formename,
					sprite: `https://static.pokefarm.com/img/pkmn/${entry.sprite}`,
					region: region
				});
			}
		}
		return map;
	}

	// #region Implementation
	/** @type {Promise<never,string>} */
	static ready;
	/** @type {string} */
	static #apiKey;
	static #loadApiKey = ()=>new Promise((resolve,reject) => {
		if( $.USERID+".userscript-api-key" in localStorage ) {
			this.#apiKey = localStorage[$.USERID+".userscript-api-key"];
			resolve();
		}
		else {
			this.#requestApiKeyFromUser();
			reject("API Key not yet set");
		}
	});

	static #requestApiKeyFromUser() {
		var li = $("<li>");
		li.html("<a href=\"#\" class=\"new\"><img src=\"/img/items/farmkey.png\" /> API Key</a>");
		$("#announcements>ul>li").eq(0).after(li);
		var btn = li.find(">a");
		btn.on("click",function() {
			new Dialog("API Key",
				"<p>A userscript is requesting access to the API.</p>"
				+ "<p>You can find or create an API key on the <a href=\"/farm#tab=5.7\">Farm page</a>.</p>"
				+ "<p>Enter your API key below:</p>"
				+ "<input type=\"password\" id=\"userscript-api-key\" placeholder=\"API Key\" />",
				[{
					text: "Save",
					action: function() {
						var key = $("#userscript-api-key").val();
						if( key ) {
							localStorage[$.USERID+".userscript-api-key"] = key;
							location.href = location.href;
						}
					}
				}, "cancel"]
			);
		});
	}
	static #resetApiKey() {
		this.#apiKey = null;
		delete localStorage[$.USERID+".userscript-api-key"];
	}

	static #request(path, method="GET") {
		return new Promise((resolve,reject) => {
			var xhr = $.ajax({
				url: `https://api-dev.pokefarm.com/v1${path}`,
				contentType: "application/json",
				headers: {
					"X-Api-Key": this.#apiKey,
				},
				method: method,
				// data: JSON.stringify(params),
				dataType: "json"
			});
			xhr.done(data=>resolve(data));
			xhr.fail((xhr,err)=>{
				if( xhr.status == 401 || xhr.status == 403 ) {
					PFQAPI.#resetApiKey();
				}
				reject(err);
			});
		});
	}
}
