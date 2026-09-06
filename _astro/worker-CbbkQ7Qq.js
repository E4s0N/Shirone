(function() {
	var Z = typeof self < "u" ? self : global;
	const _ = typeof navigator < "u", St = _ && typeof HTMLImageElement > "u", ee = !(typeof global > "u" || typeof process > "u" || !process.versions || !process.versions.node), te = Z.Buffer, de = Z.BigInt, ie = !!te, yt = (e) => e;
	function ne(e, t = yt) {
		if (ee) try {
			return typeof require == "function" ? Promise.resolve(t(require(e))) : import(e).then(t);
		} catch {
			console.warn(`Couldn't load ${e}`);
		}
	}
	let ge = Z.fetch;
	const Ct = (e) => ge = e;
	if (!Z.fetch) {
		const e = ne("http", ((n) => n)), t = ne("https", ((n) => n)), i = (n, { headers: r } = {}) => new Promise((async (s, a) => {
			let { port: o, hostname: h, pathname: c, protocol: u, search: p } = new URL(n);
			const T = {
				method: "GET",
				hostname: h,
				path: encodeURI(c) + p,
				headers: r
			};
			o !== "" && (T.port = Number(o));
			const Q = (u === "https:" ? await t : await e).request(T, ((K) => {
				if (K.statusCode === 301 || K.statusCode === 302) {
					let Fe = new URL(K.headers.location, n).toString();
					return i(Fe, { headers: r }).then(s).catch(a);
				}
				s({
					status: K.statusCode,
					arrayBuffer: () => new Promise(((Fe) => {
						let mt = [];
						K.on("data", ((qt) => mt.push(qt))), K.on("end", (() => Fe(Buffer.concat(mt))));
					}))
				});
			}));
			Q.on("error", a), Q.end();
		}));
		Ct(i);
	}
	function l(e, t, i) {
		return t in e ? Object.defineProperty(e, t, {
			value: i,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[t] = i, e;
	}
	const re = (e) => Ee(e) ? void 0 : e, bt = (e) => e !== void 0;
	function Ee(e) {
		return e === void 0 || (e instanceof Map ? e.size === 0 : Object.values(e).filter(bt).length === 0);
	}
	function m(e) {
		let t = new Error(e);
		throw delete t.stack, t;
	}
	function L(e) {
		return (e = (function(t) {
			for (; t.endsWith("\0");) t = t.slice(0, -1);
			return t;
		})(e).trim()) === "" ? void 0 : e;
	}
	function pe(e) {
		let t = (function(i) {
			let n = 0;
			return i.ifd0.enabled && (n += 1024), i.exif.enabled && (n += 2048), i.makerNote && (n += 2048), i.userComment && (n += 1024), i.gps.enabled && (n += 512), i.interop.enabled && (n += 100), i.ifd1.enabled && (n += 1024), n + 2048;
		})(e);
		return e.jfif.enabled && (t += 50), e.xmp.enabled && (t += 2e4), e.iptc.enabled && (t += 14e3), e.icc.enabled && (t += 6e3), t;
	}
	const me = (e) => String.fromCharCode.apply(null, e), Ne = typeof TextDecoder < "u" ? new TextDecoder("utf-8") : void 0;
	function Ge(e) {
		return Ne ? Ne.decode(e) : ie ? Buffer.from(e).toString("utf8") : decodeURIComponent(escape(me(e)));
	}
	var A = class X {
		static from(t, i) {
			return t instanceof this && t.le === i ? t : new X(t, void 0, void 0, i);
		}
		constructor(t, i = 0, n, r) {
			if (typeof r == "boolean" && (this.le = r), Array.isArray(t) && (t = new Uint8Array(t)), t === 0) this.byteOffset = 0, this.byteLength = 0;
			else if (t instanceof ArrayBuffer) {
				n === void 0 && (n = t.byteLength - i);
				let s = new DataView(t, i, n);
				this._swapDataView(s);
			} else if (t instanceof Uint8Array || t instanceof DataView || t instanceof X) {
				n === void 0 && (n = t.byteLength - i), (i += t.byteOffset) + n > t.byteOffset + t.byteLength && m("Creating view outside of available memory in ArrayBuffer");
				let s = new DataView(t.buffer, i, n);
				this._swapDataView(s);
			} else if (typeof t == "number") {
				let s = new DataView(new ArrayBuffer(t));
				this._swapDataView(s);
			} else m("Invalid input argument for BufferView: " + t);
		}
		_swapArrayBuffer(t) {
			this._swapDataView(new DataView(t));
		}
		_swapBuffer(t) {
			this._swapDataView(new DataView(t.buffer, t.byteOffset, t.byteLength));
		}
		_swapDataView(t) {
			this.dataView = t, this.buffer = t.buffer, this.byteOffset = t.byteOffset, this.byteLength = t.byteLength;
		}
		_lengthToEnd(t) {
			return this.byteLength - t;
		}
		set(t, i, n = X) {
			return t instanceof DataView || t instanceof X ? t = new Uint8Array(t.buffer, t.byteOffset, t.byteLength) : t instanceof ArrayBuffer && (t = new Uint8Array(t)), t instanceof Uint8Array || m("BufferView.set(): Invalid data argument."), this.toUint8().set(t, i), new n(this, i, t.byteLength);
		}
		subarray(t, i) {
			return i = i || this._lengthToEnd(t), new X(this, t, i);
		}
		toUint8() {
			return new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
		}
		getUint8Array(t, i) {
			return new Uint8Array(this.buffer, this.byteOffset + t, i);
		}
		getString(t = 0, i = this.byteLength) {
			return Ge(this.getUint8Array(t, i));
		}
		getLatin1String(t = 0, i = this.byteLength) {
			let n = this.getUint8Array(t, i);
			return me(n);
		}
		getUnicodeString(t = 0, i = this.byteLength) {
			const n = [];
			for (let r = 0; r < i && t + r < this.byteLength; r += 2) n.push(this.getUint16(t + r));
			return me(n);
		}
		getInt8(t) {
			return this.dataView.getInt8(t);
		}
		getUint8(t) {
			return this.dataView.getUint8(t);
		}
		getInt16(t, i = this.le) {
			return this.dataView.getInt16(t, i);
		}
		getInt32(t, i = this.le) {
			return this.dataView.getInt32(t, i);
		}
		getUint16(t, i = this.le) {
			return this.dataView.getUint16(t, i);
		}
		getUint32(t, i = this.le) {
			return this.dataView.getUint32(t, i);
		}
		getFloat32(t, i = this.le) {
			return this.dataView.getFloat32(t, i);
		}
		getFloat64(t, i = this.le) {
			return this.dataView.getFloat64(t, i);
		}
		getFloat(t, i = this.le) {
			return this.dataView.getFloat32(t, i);
		}
		getDouble(t, i = this.le) {
			return this.dataView.getFloat64(t, i);
		}
		getUintBytes(t, i, n) {
			switch (i) {
				case 1: return this.getUint8(t, n);
				case 2: return this.getUint16(t, n);
				case 4: return this.getUint32(t, n);
				case 8: return this.getUint64 && this.getUint64(t, n);
			}
		}
		getUint(t, i, n) {
			switch (i) {
				case 8: return this.getUint8(t, n);
				case 16: return this.getUint16(t, n);
				case 32: return this.getUint32(t, n);
				case 64: return this.getUint64 && this.getUint64(t, n);
			}
		}
		toString(t) {
			return this.dataView.toString(t, this.constructor.name);
		}
		ensureChunk() {}
	};
	function Se(e, t) {
		m(`${e} '${t}' was not loaded, try using full build of exifr.`);
	}
	var ye = class extends Map {
		constructor(e) {
			super(), this.kind = e;
		}
		get(e, t) {
			return this.has(e) || Se(this.kind, e), t && (e in t || (function(i, n) {
				m(`Unknown ${i} '${n}'.`);
			})(this.kind, e), t[e].enabled || Se(this.kind, e)), super.get(e);
		}
		keyList() {
			return Array.from(this.keys());
		}
	}, I = new ye("file parser"), g = new ye("segment parser"), w = new ye("file reader");
	function It(e, t) {
		return typeof e == "string" ? Ve(e, t) : _ && !St && e instanceof HTMLImageElement ? Ve(e.src, t) : e instanceof Uint8Array || e instanceof ArrayBuffer || e instanceof DataView ? new A(e) : _ && e instanceof Blob ? Ce(e, t, "blob", F) : void m("Invalid input argument");
	}
	function Ve(e, t) {
		return (i = e).startsWith("data:") || i.length > 1e4 ? be(e, t, "base64") : ee && e.includes("://") ? Ce(e, t, "url", U) : ee ? be(e, t, "fs") : _ ? Ce(e, t, "url", U) : void m("Invalid input argument");
		var i;
	}
	async function Ce(e, t, i, n) {
		return w.has(i) ? be(e, t, i) : n ? (async function(r, s) {
			return new A(await s(r));
		})(e, n) : void m(`Parser ${i} is not loaded`);
	}
	async function be(e, t, i) {
		let n = new (w.get(i))(e, t);
		return await n.read(), n;
	}
	const U = (e) => ge(e).then(((t) => t.arrayBuffer())), F = (e) => new Promise(((t, i) => {
		let n = new FileReader();
		n.onloadend = () => t(n.result || /* @__PURE__ */ new ArrayBuffer()), n.onerror = i, n.readAsArrayBuffer(e);
	}));
	var wt = class extends Map {
		get tagKeys() {
			return this.allKeys || (this.allKeys = Array.from(this.keys())), this.allKeys;
		}
		get tagValues() {
			return this.allValues || (this.allValues = Array.from(this.values())), this.allValues;
		}
	};
	function d(e, t, i) {
		let n = new wt();
		for (let [r, s] of i) n.set(r, s);
		if (Array.isArray(t)) for (let r of t) e.set(r, n);
		else e.set(t, n);
		return n;
	}
	function B(e, t, i) {
		let n, r = e.get(t);
		for (n of i) r.set(n[0], n[1]);
	}
	const S = /* @__PURE__ */ new Map(), C = /* @__PURE__ */ new Map(), D = /* @__PURE__ */ new Map(), v = [
		"chunked",
		"firstChunkSize",
		"firstChunkSizeNode",
		"firstChunkSizeBrowser",
		"chunkSize",
		"chunkLimit"
	], z = [
		"jfif",
		"xmp",
		"icc",
		"iptc",
		"ihdr"
	], E = ["tiff", ...z], f = [
		"ifd0",
		"ifd1",
		"exif",
		"gps",
		"interop"
	], O = [...E, ...f], x = ["makerNote", "userComment"], H = [
		"translateKeys",
		"translateValues",
		"reviveValues",
		"multiSegment"
	], M = [
		...H,
		"sanitize",
		"mergeOutput",
		"silentErrors"
	];
	var ze = class {
		get translate() {
			return this.translateKeys || this.translateValues || this.reviveValues;
		}
	}, Y = class extends ze {
		get needed() {
			return this.enabled || this.deps.size > 0;
		}
		constructor(e, t, i, n) {
			if (super(), l(this, "enabled", !1), l(this, "skip", /* @__PURE__ */ new Set()), l(this, "pick", /* @__PURE__ */ new Set()), l(this, "deps", /* @__PURE__ */ new Set()), l(this, "translateKeys", !1), l(this, "translateValues", !1), l(this, "reviveValues", !1), this.key = e, this.enabled = t, this.parse = this.enabled, this.applyInheritables(n), this.canBeFiltered = f.includes(e), this.canBeFiltered && (this.dict = S.get(e)), i !== void 0) if (Array.isArray(i)) this.parse = this.enabled = !0, this.canBeFiltered && i.length > 0 && this.translateTagSet(i, this.pick);
			else if (typeof i == "object") {
				if (this.enabled = !0, this.parse = i.parse !== !1, this.canBeFiltered) {
					let { pick: r, skip: s } = i;
					r && r.length > 0 && this.translateTagSet(r, this.pick), s && s.length > 0 && this.translateTagSet(s, this.skip);
				}
				this.applyInheritables(i);
			} else i === !0 || i === !1 ? this.parse = this.enabled = i : m(`Invalid options argument: ${i}`);
		}
		applyInheritables(e) {
			let t, i;
			for (t of H) i = e[t], i !== void 0 && (this[t] = i);
		}
		translateTagSet(e, t) {
			if (this.dict) {
				let i, n, { tagKeys: r, tagValues: s } = this.dict;
				for (i of e) typeof i == "string" ? (n = s.indexOf(i), n === -1 && (n = r.indexOf(Number(i))), n !== -1 && t.add(Number(r[n]))) : t.add(i);
			} else for (let i of e) t.add(i);
		}
		finalizeFilters() {
			!this.enabled && this.deps.size > 0 ? (this.enabled = !0, se(this.pick, this.deps)) : this.enabled && this.pick.size > 0 && se(this.pick, this.deps);
		}
	}, y = {
		jfif: !1,
		tiff: !0,
		xmp: !1,
		icc: !1,
		iptc: !1,
		ifd0: !0,
		ifd1: !1,
		exif: !0,
		gps: !0,
		interop: !1,
		ihdr: void 0,
		makerNote: !1,
		userComment: !1,
		multiSegment: !1,
		skip: [],
		pick: [],
		translateKeys: !0,
		translateValues: !0,
		reviveValues: !0,
		sanitize: !0,
		mergeOutput: !0,
		silentErrors: !0,
		chunked: !0,
		firstChunkSize: void 0,
		firstChunkSizeNode: 512,
		firstChunkSizeBrowser: 65536,
		chunkSize: 65536,
		chunkLimit: 5
	}, He = /* @__PURE__ */ new Map(), N = class extends ze {
		static useCached(e) {
			let t = He.get(e);
			return t !== void 0 || (t = new this(e), He.set(e, t)), t;
		}
		constructor(e) {
			super(), e === !0 ? this.setupFromTrue() : e === void 0 ? this.setupFromUndefined() : Array.isArray(e) ? this.setupFromArray(e) : typeof e == "object" ? this.setupFromObject(e) : m(`Invalid options argument ${e}`), this.firstChunkSize === void 0 && (this.firstChunkSize = _ ? this.firstChunkSizeBrowser : this.firstChunkSizeNode), this.mergeOutput && (this.ifd1.enabled = !1), this.filterNestedSegmentTags(), this.traverseTiffDependencyTree(), this.checkLoadedPlugins();
		}
		setupFromUndefined() {
			let e;
			for (e of v) this[e] = y[e];
			for (e of M) this[e] = y[e];
			for (e of x) this[e] = y[e];
			for (e of O) this[e] = new Y(e, y[e], void 0, this);
		}
		setupFromTrue() {
			let e;
			for (e of v) this[e] = y[e];
			for (e of M) this[e] = y[e];
			for (e of x) this[e] = !0;
			for (e of O) this[e] = new Y(e, !0, void 0, this);
		}
		setupFromArray(e) {
			let t;
			for (t of v) this[t] = y[t];
			for (t of M) this[t] = y[t];
			for (t of x) this[t] = y[t];
			for (t of O) this[t] = new Y(t, !1, void 0, this);
			this.setupGlobalFilters(e, void 0, f);
		}
		setupFromObject(e) {
			let t;
			for (t of (f.ifd0 = f.ifd0 || f.image, f.ifd1 = f.ifd1 || f.thumbnail, Object.assign(this, e), v)) this[t] = Ie(e[t], y[t]);
			for (t of M) this[t] = Ie(e[t], y[t]);
			for (t of x) this[t] = Ie(e[t], y[t]);
			for (t of E) this[t] = new Y(t, y[t], e[t], this);
			for (t of f) this[t] = new Y(t, y[t], e[t], this.tiff);
			this.setupGlobalFilters(e.pick, e.skip, f, O), e.tiff === !0 ? this.batchEnableWithBool(f, !0) : e.tiff === !1 ? this.batchEnableWithUserValue(f, e) : Array.isArray(e.tiff) ? this.setupGlobalFilters(e.tiff, void 0, f) : typeof e.tiff == "object" && this.setupGlobalFilters(e.tiff.pick, e.tiff.skip, f);
		}
		batchEnableWithBool(e, t) {
			for (let i of e) this[i].enabled = t;
		}
		batchEnableWithUserValue(e, t) {
			for (let i of e) {
				let n = t[i];
				this[i].enabled = n !== !1 && n !== void 0;
			}
		}
		setupGlobalFilters(e, t, i, n = i) {
			if (e && e.length) {
				for (let s of n) this[s].enabled = !1;
				let r = je(e, i);
				for (let [s, a] of r) se(this[s].pick, a), this[s].enabled = !0;
			} else if (t && t.length) {
				let r = je(t, i);
				for (let [s, a] of r) se(this[s].skip, a);
			}
		}
		filterNestedSegmentTags() {
			let { ifd0: e, exif: t, xmp: i, iptc: n, icc: r } = this;
			this.makerNote ? t.deps.add(37500) : t.skip.add(37500), this.userComment ? t.deps.add(37510) : t.skip.add(37510), i.enabled || e.skip.add(700), n.enabled || e.skip.add(33723), r.enabled || e.skip.add(34675);
		}
		traverseTiffDependencyTree() {
			let { ifd0: e, exif: t, gps: i, interop: n } = this;
			n.needed && (t.deps.add(40965), e.deps.add(40965)), t.needed && e.deps.add(34665), i.needed && e.deps.add(34853), this.tiff.enabled = f.some(((r) => this[r].enabled === !0)) || this.makerNote || this.userComment;
			for (let r of f) this[r].finalizeFilters();
		}
		get onlyTiff() {
			return !z.map(((e) => this[e].enabled)).some(((e) => e === !0)) && this.tiff.enabled;
		}
		checkLoadedPlugins() {
			for (let e of E) this[e].enabled && !g.has(e) && Se("segment parser", e);
		}
	};
	function je(e, t) {
		let i, n, r, s, a = [];
		for (r of t) {
			for (s of (i = S.get(r), n = [], i)) (e.includes(s[0]) || e.includes(s[1])) && n.push(s[0]);
			n.length && a.push([r, n]);
		}
		return a;
	}
	function Ie(e, t) {
		return e !== void 0 ? e : t !== void 0 ? t : void 0;
	}
	function se(e, t) {
		for (let i of t) e.add(i);
	}
	l(N, "default", y);
	var R = class {
		constructor(e) {
			l(this, "parsers", {}), l(this, "output", {}), l(this, "errors", []), l(this, "pushToErrors", ((t) => this.errors.push(t))), this.options = N.useCached(e);
		}
		async read(e) {
			this.file = await It(e, this.options);
		}
		setup() {
			if (this.fileParser) return;
			let { file: e } = this, t = e.getUint16(0);
			for (let [i, n] of I) if (n.canHandle(e, t)) return this.fileParser = new n(this.options, this.file, this.parsers), e[i] = !0;
			this.file.close && this.file.close(), m("Unknown file format");
		}
		async parse() {
			let { output: e, errors: t } = this;
			return this.setup(), this.options.silentErrors ? (await this.executeParsers().catch(this.pushToErrors), t.push(...this.fileParser.errors)) : await this.executeParsers(), this.file.close && this.file.close(), this.options.silentErrors && t.length > 0 && (e.errors = t), re(e);
		}
		async executeParsers() {
			let { output: e } = this;
			await this.fileParser.parse();
			let t = Object.values(this.parsers).map((async (i) => {
				let n = await i.parse();
				i.assignToOutput(e, n);
			}));
			this.options.silentErrors && (t = t.map(((i) => i.catch(this.pushToErrors)))), await Promise.all(t);
		}
		async extractThumbnail() {
			this.setup();
			let { options: e, file: t } = this, i = g.get("tiff", e);
			var n;
			if (t.tiff ? n = {
				start: 0,
				type: "tiff"
			} : t.jpeg && (n = await this.fileParser.getOrFindSegment("tiff")), n === void 0) return;
			let r = await this.fileParser.ensureSegmentChunk(n), s = await (this.parsers.tiff = new i(r, e, t)).extractThumbnail();
			return t.close && t.close(), s;
		}
	};
	async function ae(e, t) {
		let i = new R(t);
		return await i.read(e), i.parse();
	}
	var Pt = Object.freeze({
		__proto__: null,
		parse: ae,
		Exifr: R,
		fileParsers: I,
		segmentParsers: g,
		fileReaders: w,
		tagKeys: S,
		tagValues: C,
		tagRevivers: D,
		createDictionary: d,
		extendDictionary: B,
		fetchUrlAsArrayBuffer: U,
		readBlobAsArrayBuffer: F,
		chunkedProps: v,
		otherSegments: z,
		segments: E,
		tiffBlocks: f,
		segmentsAndBlocks: O,
		tiffExtractables: x,
		inheritables: H,
		allFormatters: M,
		Options: N
	}), oe = class {
		constructor(e, t, i) {
			l(this, "errors", []), l(this, "ensureSegmentChunk", (async (n) => {
				let r = n.start, s = n.size || 65536;
				if (this.file.chunked) if (this.file.available(r, s)) n.chunk = this.file.subarray(r, s);
				else try {
					n.chunk = await this.file.readChunk(r, s);
				} catch (a) {
					m(`Couldn't read segment: ${JSON.stringify(n)}. ${a.message}`);
				}
				else this.file.byteLength > r + s ? n.chunk = this.file.subarray(r, s) : n.size === void 0 ? n.chunk = this.file.subarray(r) : m("Segment unreachable: " + JSON.stringify(n));
				return n.chunk;
			})), this.extendOptions && this.extendOptions(e), this.options = e, this.file = t, this.parsers = i;
		}
		injectSegment(e, t) {
			this.options[e].enabled && this.createParser(e, t);
		}
		createParser(e, t) {
			let i = new (g.get(e))(t, this.options, this.file);
			return this.parsers[e] = i;
		}
		createParsers(e) {
			for (let t of e) {
				let { type: i, chunk: n } = t, r = this.options[i];
				if (r && r.enabled) {
					let s = this.parsers[i];
					s && s.append || s || this.createParser(i, n);
				}
			}
		}
		async readSegments(e) {
			let t = e.map(this.ensureSegmentChunk);
			await Promise.all(t);
		}
	}, b = class {
		static findPosition(e, t) {
			let i = e.getUint16(t + 2) + 2, n = typeof this.headerLength == "function" ? this.headerLength(e, t, i) : this.headerLength, r = t + n, s = i - n;
			return {
				offset: t,
				length: i,
				headerLength: n,
				start: r,
				size: s,
				end: r + s
			};
		}
		static parse(e, t = {}) {
			return new this(e, new N({ [this.type]: t }), e).parse();
		}
		normalizeInput(e) {
			return e instanceof A ? e : new A(e);
		}
		constructor(e, t = {}, i) {
			l(this, "errors", []), l(this, "raw", /* @__PURE__ */ new Map()), l(this, "handleError", ((n) => {
				if (!this.options.silentErrors) throw n;
				this.errors.push(n.message);
			})), this.chunk = this.normalizeInput(e), this.file = i, this.type = this.constructor.type, this.globalOptions = this.options = t, this.localOptions = t[this.type], this.canTranslate = this.localOptions && this.localOptions.translate;
		}
		translate() {
			this.canTranslate && (this.translated = this.translateBlock(this.raw, this.type));
		}
		get output() {
			return this.translated ? this.translated : this.raw ? Object.fromEntries(this.raw) : void 0;
		}
		translateBlock(e, t) {
			let i = D.get(t), n = C.get(t), r = S.get(t), s = this.options[t], a = s.reviveValues && !!i, o = s.translateValues && !!n, h = s.translateKeys && !!r, c = {};
			for (let [u, p] of e) a && i.has(u) ? p = i.get(u)(p) : o && n.has(u) && (p = this.translateValue(p, n.get(u))), h && r.has(u) && (u = r.get(u) || u), c[u] = p;
			return c;
		}
		translateValue(e, t) {
			return t[e] || t.DEFAULT || e;
		}
		assignToOutput(e, t) {
			this.assignObjectToOutput(e, this.constructor.type, t);
		}
		assignObjectToOutput(e, t, i) {
			if (this.globalOptions.mergeOutput) return Object.assign(e, i);
			e[t] ? Object.assign(e[t], i) : e[t] = i;
		}
	};
	l(b, "headerLength", 4), l(b, "type", void 0), l(b, "multiSegment", !1), l(b, "canHandle", (() => !1));
	function kt(e) {
		return e === 192 || e === 194 || e === 196 || e === 219 || e === 221 || e === 218 || e === 254;
	}
	function Tt(e) {
		return e >= 224 && e <= 239;
	}
	function At(e, t, i) {
		for (let [n, r] of g) if (r.canHandle(e, t, i)) return n;
	}
	var We = class extends oe {
		constructor(...e) {
			super(...e), l(this, "appSegments", []), l(this, "jpegSegments", []), l(this, "unknownSegments", []);
		}
		static canHandle(e, t) {
			return t === 65496;
		}
		async parse() {
			await this.findAppSegments(), await this.readSegments(this.appSegments), this.mergeMultiSegments(), this.createParsers(this.mergedAppSegments || this.appSegments);
		}
		setupSegmentFinderArgs(e) {
			e === !0 ? (this.findAll = !0, this.wanted = new Set(g.keyList())) : (e = e === void 0 ? g.keyList().filter(((t) => this.options[t].enabled)) : e.filter(((t) => this.options[t].enabled && g.has(t))), this.findAll = !1, this.remaining = new Set(e), this.wanted = new Set(e)), this.unfinishedMultiSegment = !1;
		}
		async findAppSegments(e = 0, t) {
			this.setupSegmentFinderArgs(t);
			let { file: i, findAll: n, wanted: r, remaining: s } = this;
			if (!n && this.file.chunked && (n = Array.from(r).some(((a) => {
				let o = g.get(a), h = this.options[a];
				return o.multiSegment && h.multiSegment;
			})), n && await this.file.readWhole()), e = this.findAppSegmentsInRange(e, i.byteLength), !this.options.onlyTiff && i.chunked) {
				let a = !1;
				for (; s.size > 0 && !a && (i.canReadNextChunk || this.unfinishedMultiSegment);) {
					let { nextChunkOffset: o } = i, h = this.appSegments.some(((c) => !this.file.available(c.offset || c.start, c.length || c.size)));
					if (a = e > o && !h ? !await i.readNextChunk(e) : !await i.readNextChunk(o), (e = this.findAppSegmentsInRange(e, i.byteLength)) === void 0) return;
				}
			}
		}
		findAppSegmentsInRange(e, t) {
			t -= 2;
			let i, n, r, s, a, o, { file: h, findAll: c, wanted: u, remaining: p, options: T } = this;
			for (; e < t; e++) if (h.getUint8(e) === 255) {
				if (i = h.getUint8(e + 1), Tt(i)) {
					if (n = h.getUint16(e + 2), r = At(h, e, n), r && u.has(r) && (s = g.get(r), a = s.findPosition(h, e), o = T[r], a.type = r, this.appSegments.push(a), !c && (s.multiSegment && o.multiSegment ? (this.unfinishedMultiSegment = a.chunkNumber < a.chunkCount, this.unfinishedMultiSegment || p.delete(r)) : p.delete(r), p.size === 0))) break;
					T.recordUnknownSegments && (a = b.findPosition(h, e), a.marker = i, this.unknownSegments.push(a)), e += n + 1;
				} else if (kt(i)) {
					if (n = h.getUint16(e + 2), i === 218 && T.stopAfterSos !== !1) return;
					T.recordJpegSegments && this.jpegSegments.push({
						offset: e,
						length: n,
						marker: i
					}), e += n + 1;
				}
			}
			return e;
		}
		mergeMultiSegments() {
			if (!this.appSegments.some(((t) => t.multiSegment))) return;
			let e = (function(t, i) {
				let n, r, s, a = /* @__PURE__ */ new Map();
				for (let o = 0; o < t.length; o++) n = t[o], r = n[i], a.has(r) ? s = a.get(r) : a.set(r, s = []), s.push(n);
				return Array.from(a);
			})(this.appSegments, "type");
			this.mergedAppSegments = e.map((([t, i]) => {
				let n = g.get(t, this.options);
				return n.handleMultiSegments ? {
					type: t,
					chunk: n.handleMultiSegments(i)
				} : i[0];
			}));
		}
		getSegment(e) {
			return this.appSegments.find(((t) => t.type === e));
		}
		async getOrFindSegment(e) {
			let t = this.getSegment(e);
			return t === void 0 && (await this.findAppSegments(0, [e]), t = this.getSegment(e)), t;
		}
	};
	l(We, "type", "jpeg"), I.set("jpeg", We);
	const Dt = [
		void 0,
		1,
		1,
		2,
		4,
		8,
		1,
		1,
		2,
		4,
		8,
		4,
		8,
		4
	];
	var vt = class extends b {
		parseHeader() {
			var e = this.chunk.getUint16();
			e === 18761 ? this.le = !0 : e === 19789 && (this.le = !1), this.chunk.le = this.le, this.headerParsed = !0;
		}
		parseTags(e, t, i = /* @__PURE__ */ new Map()) {
			let { pick: n, skip: r } = this.options[t];
			n = new Set(n);
			let s = n.size > 0, a = r.size === 0, o = this.chunk.getUint16(e);
			e += 2;
			for (let h = 0; h < o; h++) {
				let c = this.chunk.getUint16(e);
				if (s) {
					if (n.has(c) && (i.set(c, this.parseTag(e, c, t)), n.delete(c), n.size === 0)) break;
				} else !a && r.has(c) || i.set(c, this.parseTag(e, c, t));
				e += 12;
			}
			return i;
		}
		parseTag(e, t, i) {
			let { chunk: n } = this, r = n.getUint16(e + 2), s = n.getUint32(e + 4), a = Dt[r];
			if (a * s <= 4 ? e += 8 : e = n.getUint32(e + 8), (r < 1 || r > 13) && m(`Invalid TIFF value type. block: ${i.toUpperCase()}, tag: ${t.toString(16)}, type: ${r}, offset ${e}`), e > n.byteLength && m(`Invalid TIFF value offset. block: ${i.toUpperCase()}, tag: ${t.toString(16)}, type: ${r}, offset ${e} is outside of chunk size ${n.byteLength}`), r === 1) return n.getUint8Array(e, s);
			if (r === 2) return L(n.getString(e, s));
			if (r === 7) return n.getUint8Array(e, s);
			if (s === 1) return this.parseTagValue(r, e);
			{
				let o = new ((function(c) {
					switch (c) {
						case 1: return Uint8Array;
						case 3: return Uint16Array;
						case 4: return Uint32Array;
						case 5: return Array;
						case 6: return Int8Array;
						case 8: return Int16Array;
						case 9: return Int32Array;
						case 10: return Array;
						case 11: return Float32Array;
						case 12: return Float64Array;
						default: return Array;
					}
				})(r))(s), h = a;
				for (let c = 0; c < s; c++) o[c] = this.parseTagValue(r, e), e += h;
				return o;
			}
		}
		parseTagValue(e, t) {
			let { chunk: i } = this;
			switch (e) {
				case 1: return i.getUint8(t);
				case 3: return i.getUint16(t);
				case 4: return i.getUint32(t);
				case 5: return i.getUint32(t) / i.getUint32(t + 4);
				case 6: return i.getInt8(t);
				case 8: return i.getInt16(t);
				case 9: return i.getInt32(t);
				case 10: return i.getInt32(t) / i.getInt32(t + 4);
				case 11: return i.getFloat(t);
				case 12: return i.getDouble(t);
				case 13: return i.getUint32(t);
				default: m(`Invalid tiff type ${e}`);
			}
		}
	}, we = class extends vt {
		static canHandle(e, t) {
			return e.getUint8(t + 1) === 225 && e.getUint32(t + 4) === 1165519206 && e.getUint16(t + 8) === 0;
		}
		async parse() {
			this.parseHeader();
			let { options: e } = this;
			return e.ifd0.enabled && await this.parseIfd0Block(), e.exif.enabled && await this.safeParse("parseExifBlock"), e.gps.enabled && await this.safeParse("parseGpsBlock"), e.interop.enabled && await this.safeParse("parseInteropBlock"), e.ifd1.enabled && await this.safeParse("parseThumbnailBlock"), this.createOutput();
		}
		safeParse(e) {
			let t = this[e]();
			return t.catch !== void 0 && (t = t.catch(this.handleError)), t;
		}
		findIfd0Offset() {
			this.ifd0Offset === void 0 && (this.ifd0Offset = this.chunk.getUint32(4));
		}
		findIfd1Offset() {
			if (this.ifd1Offset === void 0) {
				this.findIfd0Offset();
				let e = this.chunk.getUint16(this.ifd0Offset), t = this.ifd0Offset + 2 + 12 * e;
				this.ifd1Offset = this.chunk.getUint32(t);
			}
		}
		parseBlock(e, t) {
			let i = /* @__PURE__ */ new Map();
			return this[t] = i, this.parseTags(e, t, i), i;
		}
		async parseIfd0Block() {
			if (this.ifd0) return;
			let { file: e } = this;
			this.findIfd0Offset(), this.ifd0Offset < 8 && m("Malformed EXIF data"), !e.chunked && this.ifd0Offset > e.byteLength && m(`IFD0 offset points to outside of file.
this.ifd0Offset: ${this.ifd0Offset}, file.byteLength: ${e.byteLength}`), e.tiff && await e.ensureChunk(this.ifd0Offset, pe(this.options));
			let t = this.parseBlock(this.ifd0Offset, "ifd0");
			return t.size !== 0 ? (this.exifOffset = t.get(34665), this.interopOffset = t.get(40965), this.gpsOffset = t.get(34853), this.xmp = t.get(700), this.iptc = t.get(33723), this.icc = t.get(34675), this.options.sanitize && (t.delete(34665), t.delete(40965), t.delete(34853), t.delete(700), t.delete(33723), t.delete(34675)), t) : void 0;
		}
		async parseExifBlock() {
			if (this.exif || (this.ifd0 || await this.parseIfd0Block(), this.exifOffset === void 0)) return;
			this.file.tiff && await this.file.ensureChunk(this.exifOffset, pe(this.options));
			let e = this.parseBlock(this.exifOffset, "exif");
			return this.interopOffset || (this.interopOffset = e.get(40965)), this.makerNote = e.get(37500), this.userComment = e.get(37510), this.options.sanitize && (e.delete(40965), e.delete(37500), e.delete(37510)), this.unpack(e, 41728), this.unpack(e, 41729), e;
		}
		unpack(e, t) {
			let i = e.get(t);
			i && i.length === 1 && e.set(t, i[0]);
		}
		async parseGpsBlock() {
			if (this.gps || (this.ifd0 || await this.parseIfd0Block(), this.gpsOffset === void 0)) return;
			let e = this.parseBlock(this.gpsOffset, "gps");
			return e && e.has(2) && e.has(4) && (e.set("latitude", Ke(...e.get(2), e.get(1))), e.set("longitude", Ke(...e.get(4), e.get(3)))), e;
		}
		async parseInteropBlock() {
			if (!this.interop && (this.ifd0 || await this.parseIfd0Block(), this.interopOffset !== void 0 || this.exif || await this.parseExifBlock(), this.interopOffset !== void 0)) return this.parseBlock(this.interopOffset, "interop");
		}
		async parseThumbnailBlock(e = !1) {
			if (!this.ifd1 && !this.ifd1Parsed && (!this.options.mergeOutput || e)) return this.findIfd1Offset(), this.ifd1Offset > 0 && (this.parseBlock(this.ifd1Offset, "ifd1"), this.ifd1Parsed = !0), this.ifd1;
		}
		async extractThumbnail() {
			if (this.headerParsed || this.parseHeader(), this.ifd1Parsed || await this.parseThumbnailBlock(!0), this.ifd1 === void 0) return;
			let e = this.ifd1.get(513), t = this.ifd1.get(514);
			return this.chunk.getUint8Array(e, t);
		}
		get image() {
			return this.ifd0;
		}
		get thumbnail() {
			return this.ifd1;
		}
		createOutput() {
			let e, t, i, n = {};
			for (t of f) if (e = this[t], !Ee(e)) if (i = this.canTranslate ? this.translateBlock(e, t) : Object.fromEntries(e), this.options.mergeOutput) {
				if (t === "ifd1") continue;
				Object.assign(n, i);
			} else n[t] = i;
			return this.makerNote && (n.makerNote = this.makerNote), this.userComment && (n.userComment = this.userComment), n;
		}
		assignToOutput(e, t) {
			if (this.globalOptions.mergeOutput) Object.assign(e, t);
			else for (let [i, n] of Object.entries(t)) this.assignObjectToOutput(e, i, n);
		}
	};
	function Ke(e, t, i, n) {
		var r = e + t / 60 + i / 3600;
		return n !== "S" && n !== "W" || (r *= -1), r;
	}
	l(we, "type", "tiff"), l(we, "headerLength", 10), g.set("tiff", we);
	var Ot = Object.freeze({
		__proto__: null,
		default: Pt,
		Exifr: R,
		fileParsers: I,
		segmentParsers: g,
		fileReaders: w,
		tagKeys: S,
		tagValues: C,
		tagRevivers: D,
		createDictionary: d,
		extendDictionary: B,
		fetchUrlAsArrayBuffer: U,
		readBlobAsArrayBuffer: F,
		chunkedProps: v,
		otherSegments: z,
		segments: E,
		tiffBlocks: f,
		segmentsAndBlocks: O,
		tiffExtractables: x,
		inheritables: H,
		allFormatters: M,
		Options: N,
		parse: ae
	});
	const Pe = {
		ifd0: !1,
		ifd1: !1,
		exif: !1,
		gps: !1,
		interop: !1,
		sanitize: !1,
		reviveValues: !0,
		translateKeys: !1,
		translateValues: !1,
		mergeOutput: !1
	}, ke = Object.assign({}, Pe, {
		firstChunkSize: 4e4,
		gps: [
			1,
			2,
			3,
			4
		]
	});
	async function Xe(e) {
		let t = new R(ke);
		await t.read(e);
		let i = await t.parse();
		if (i && i.gps) {
			let { latitude: n, longitude: r } = i.gps;
			return {
				latitude: n,
				longitude: r
			};
		}
	}
	const Te = Object.assign({}, Pe, {
		tiff: !1,
		ifd1: !0,
		mergeOutput: !1
	});
	async function _e(e) {
		let t = new R(Te);
		await t.read(e);
		let i = await t.extractThumbnail();
		return i && ie ? te.from(i) : i;
	}
	async function Ye(e) {
		let t = await this.thumbnail(e);
		if (t !== void 0) {
			let i = new Blob([t]);
			return URL.createObjectURL(i);
		}
	}
	const Ae = Object.assign({}, Pe, {
		firstChunkSize: 4e4,
		ifd0: [274]
	});
	async function De(e) {
		let t = new R(Ae);
		await t.read(e);
		let i = await t.parse();
		if (i && i.ifd0) return i.ifd0[274];
	}
	const ve = Object.freeze({
		1: {
			dimensionSwapped: !1,
			scaleX: 1,
			scaleY: 1,
			deg: 0,
			rad: 0
		},
		2: {
			dimensionSwapped: !1,
			scaleX: -1,
			scaleY: 1,
			deg: 0,
			rad: 0
		},
		3: {
			dimensionSwapped: !1,
			scaleX: 1,
			scaleY: 1,
			deg: 180,
			rad: 180 * Math.PI / 180
		},
		4: {
			dimensionSwapped: !1,
			scaleX: -1,
			scaleY: 1,
			deg: 180,
			rad: 180 * Math.PI / 180
		},
		5: {
			dimensionSwapped: !0,
			scaleX: 1,
			scaleY: -1,
			deg: 90,
			rad: 90 * Math.PI / 180
		},
		6: {
			dimensionSwapped: !0,
			scaleX: 1,
			scaleY: 1,
			deg: 90,
			rad: 90 * Math.PI / 180
		},
		7: {
			dimensionSwapped: !0,
			scaleX: 1,
			scaleY: -1,
			deg: 270,
			rad: 270 * Math.PI / 180
		},
		8: {
			dimensionSwapped: !0,
			scaleX: 1,
			scaleY: 1,
			deg: 270,
			rad: 270 * Math.PI / 180
		}
	});
	let G = !0, V = !0;
	if (typeof navigator == "object") {
		let e = navigator.userAgent;
		if (e.includes("iPad") || e.includes("iPhone")) {
			let t = e.match(/OS (\d+)_(\d+)/);
			if (t) {
				let [, i, n] = t;
				G = Number(i) + .1 * Number(n) < 13.4, V = !1;
			}
		} else if (e.includes("OS X 10")) {
			let [, t] = e.match(/OS X 10[_.](\d+)/);
			G = V = Number(t) < 15;
		}
		if (e.includes("Chrome/")) {
			let [, t] = e.match(/Chrome\/(\d+)/);
			G = V = Number(t) < 81;
		} else if (e.includes("Firefox/")) {
			let [, t] = e.match(/Firefox\/(\d+)/);
			G = V = Number(t) < 77;
		}
	}
	async function $e(e) {
		let t = await De(e);
		return Object.assign({
			canvas: G,
			css: V
		}, ve[t]);
	}
	var xt = class extends A {
		constructor(...e) {
			super(...e), l(this, "ranges", new Mt()), this.byteLength !== 0 && this.ranges.add(0, this.byteLength);
		}
		_tryExtend(e, t, i) {
			if (e === 0 && this.byteLength === 0 && i) {
				let n = new DataView(i.buffer || i, i.byteOffset, i.byteLength);
				this._swapDataView(n);
			} else {
				let n = e + t;
				if (n > this.byteLength) {
					let { dataView: r } = this._extend(n);
					this._swapDataView(r);
				}
			}
		}
		_extend(e) {
			let t;
			t = ie ? te.allocUnsafe(e) : new Uint8Array(e);
			let i = new DataView(t.buffer, t.byteOffset, t.byteLength);
			return t.set(new Uint8Array(this.buffer, this.byteOffset, this.byteLength), 0), {
				uintView: t,
				dataView: i
			};
		}
		subarray(e, t, i = !1) {
			return t = t || this._lengthToEnd(e), i && this._tryExtend(e, t), this.ranges.add(e, t), super.subarray(e, t);
		}
		set(e, t, i = !1) {
			i && this._tryExtend(t, e.byteLength, e);
			let n = super.set(e, t);
			return this.ranges.add(t, n.byteLength), n;
		}
		async ensureChunk(e, t) {
			this.chunked && (this.ranges.available(e, t) || await this.readChunk(e, t));
		}
		available(e, t) {
			return this.ranges.available(e, t);
		}
	}, Mt = class {
		constructor() {
			l(this, "list", []);
		}
		get length() {
			return this.list.length;
		}
		add(e, t, i = 0) {
			let n = e + t, r = this.list.filter(((s) => qe(e, s.offset, n) || qe(e, s.end, n)));
			if (r.length > 0) {
				e = Math.min(e, ...r.map(((a) => a.offset))), n = Math.max(n, ...r.map(((a) => a.end))), t = n - e;
				let s = r.shift();
				s.offset = e, s.length = t, s.end = n, this.list = this.list.filter(((a) => !r.includes(a)));
			} else this.list.push({
				offset: e,
				length: t,
				end: n
			});
		}
		available(e, t) {
			let i = e + t;
			return this.list.some(((n) => n.offset <= e && i <= n.end));
		}
	};
	function qe(e, t, i) {
		return e <= t && t <= i;
	}
	var le = class extends xt {
		constructor(e, t) {
			super(0), l(this, "chunksRead", 0), this.input = e, this.options = t;
		}
		async readWhole() {
			this.chunked = !1, await this.readChunk(this.nextChunkOffset);
		}
		async readChunked() {
			this.chunked = !0, await this.readChunk(0, this.options.firstChunkSize);
		}
		async readNextChunk(e = this.nextChunkOffset) {
			if (this.fullyRead) return this.chunksRead++, !1;
			let t = this.options.chunkSize, i = await this.readChunk(e, t);
			return !!i && i.byteLength === t;
		}
		async readChunk(e, t) {
			if (this.chunksRead++, (t = this.safeWrapAddress(e, t)) !== 0) return this._readChunk(e, t);
		}
		safeWrapAddress(e, t) {
			return this.size !== void 0 && e + t > this.size ? Math.max(0, this.size - e) : t;
		}
		get nextChunkOffset() {
			if (this.ranges.list.length !== 0) return this.ranges.list[0].length;
		}
		get canReadNextChunk() {
			return this.chunksRead < this.options.chunkLimit;
		}
		get fullyRead() {
			return this.size !== void 0 && this.nextChunkOffset === this.size;
		}
		read() {
			return this.options.chunked ? this.readChunked() : this.readWhole();
		}
		close() {}
	};
	w.set("blob", class extends le {
		async readWhole() {
			this.chunked = !1;
			let e = await F(this.input);
			this._swapArrayBuffer(e);
		}
		readChunked() {
			return this.chunked = !0, this.size = this.input.size, super.readChunked();
		}
		async _readChunk(e, t) {
			let i = t ? e + t : void 0, n = this.input.slice(e, i), r = await F(n);
			return this.set(r, e, !0);
		}
	});
	var Rt = Object.freeze({
		__proto__: null,
		default: Ot,
		Exifr: R,
		fileParsers: I,
		segmentParsers: g,
		fileReaders: w,
		tagKeys: S,
		tagValues: C,
		tagRevivers: D,
		createDictionary: d,
		extendDictionary: B,
		fetchUrlAsArrayBuffer: U,
		readBlobAsArrayBuffer: F,
		chunkedProps: v,
		otherSegments: z,
		segments: E,
		tiffBlocks: f,
		segmentsAndBlocks: O,
		tiffExtractables: x,
		inheritables: H,
		allFormatters: M,
		Options: N,
		parse: ae,
		gpsOnlyOptions: ke,
		gps: Xe,
		thumbnailOnlyOptions: Te,
		thumbnail: _e,
		thumbnailUrl: Ye,
		orientationOnlyOptions: Ae,
		orientation: De,
		rotations: ve,
		get rotateCanvas() {
			return G;
		},
		get rotateCss() {
			return V;
		},
		rotation: $e
	});
	w.set("url", class extends le {
		async readWhole() {
			this.chunked = !1;
			let e = await U(this.input);
			e instanceof ArrayBuffer ? this._swapArrayBuffer(e) : e instanceof Uint8Array && this._swapBuffer(e);
		}
		async _readChunk(e, t) {
			let i = t ? e + t - 1 : void 0, n = this.options.httpHeaders || {};
			(e || i) && (n.range = `bytes=${[e, i].join("-")}`);
			let r = await ge(this.input, { headers: n }), s = await r.arrayBuffer(), a = s.byteLength;
			if (r.status !== 416) return a !== t && (this.size = e + a), this.set(s, e, !0);
		}
	}), A.prototype.getUint64 = function(e) {
		let t = this.getUint32(e), i = this.getUint32(e + 4);
		return t < 1048575 ? t << 32 | i : (console.warn("Using BigInt because of type 64uint but JS can only handle 53b numbers."), de(t) << de(32) | de(i));
	};
	var Lt = class extends oe {
		parseBoxes(e = 0) {
			let t = [];
			for (; e < this.file.byteLength - 4;) {
				let i = this.parseBoxHead(e);
				if (t.push(i), i.length === 0) break;
				e += i.length;
			}
			return t;
		}
		parseSubBoxes(e) {
			e.boxes = this.parseBoxes(e.start);
		}
		findBox(e, t) {
			return e.boxes === void 0 && this.parseSubBoxes(e), e.boxes.find(((i) => i.kind === t));
		}
		parseBoxHead(e) {
			let t = this.file.getUint32(e), i = this.file.getString(e + 4, 4), n = e + 8;
			return t === 1 && (t = this.file.getUint64(e + 8), n += 8), {
				offset: e,
				length: t,
				kind: i,
				start: n
			};
		}
		parseBoxFullHead(e) {
			e.version === void 0 && (e.version = this.file.getUint32(e.start) >> 24, e.start += 4);
		}
	}, Je = class extends Lt {
		static canHandle(e, t) {
			if (t !== 0) return !1;
			let i = e.getUint16(2);
			if (i > 50) return !1;
			let n = 16, r = [];
			for (; n < i;) r.push(e.getString(n, 4)), n += 4;
			return r.includes(this.type);
		}
		async parse() {
			let e = this.file.getUint32(0), t = this.parseBoxHead(e);
			for (; t.kind !== "meta";) e += t.length, await this.file.ensureChunk(e, 16), t = this.parseBoxHead(e);
			await this.file.ensureChunk(t.offset, t.length), this.parseBoxFullHead(t), this.parseSubBoxes(t), this.options.icc.enabled && await this.findIcc(t), this.options.tiff.enabled && await this.findExif(t);
		}
		async registerSegment(e, t, i) {
			await this.file.ensureChunk(t, i);
			let n = this.file.subarray(t, i);
			this.createParser(e, n);
		}
		async findIcc(e) {
			let t = this.findBox(e, "iprp");
			if (t === void 0) return;
			let i = this.findBox(t, "ipco");
			if (i === void 0) return;
			let n = this.findBox(i, "colr");
			n !== void 0 && await this.registerSegment("icc", n.offset + 12, n.length);
		}
		async findExif(e) {
			let t = this.findBox(e, "iinf");
			if (t === void 0) return;
			let i = this.findBox(e, "iloc");
			if (i === void 0) return;
			let n = this.findExifLocIdInIinf(t), r = this.findExtentInIloc(i, n);
			if (r === void 0) return;
			let [s, a] = r;
			await this.file.ensureChunk(s, a);
			let o = 4 + this.file.getUint32(s);
			s += o, a -= o, await this.registerSegment("tiff", s, a);
		}
		findExifLocIdInIinf(e) {
			this.parseBoxFullHead(e);
			let t, i, n, r, s = e.start, a = this.file.getUint16(s);
			for (s += 2; a--;) {
				if (t = this.parseBoxHead(s), this.parseBoxFullHead(t), i = t.start, t.version >= 2 && (n = t.version === 3 ? 4 : 2, r = this.file.getString(i + n + 2, 4), r === "Exif")) return this.file.getUintBytes(i, n);
				s += t.length;
			}
		}
		get8bits(e) {
			let t = this.file.getUint8(e);
			return [t >> 4, 15 & t];
		}
		findExtentInIloc(e, t) {
			this.parseBoxFullHead(e);
			let i = e.start, [n, r] = this.get8bits(i++), [s, a] = this.get8bits(i++), o = e.version === 2 ? 4 : 2, h = e.version === 1 || e.version === 2 ? 2 : 0, c = a + n + r, u = e.version === 2 ? 4 : 2, p = this.file.getUintBytes(i, u);
			for (i += u; p--;) {
				let T = this.file.getUintBytes(i, o);
				i += o + h + 2 + s;
				let Q = this.file.getUint16(i);
				if (i += 2, T === t) return Q > 1 && console.warn(`ILOC box has more than one extent but we're only processing one
Please create an issue at https://github.com/MikeKovarik/exifr with this file`), [this.file.getUintBytes(i + a, n), this.file.getUintBytes(i + a + n, r)];
				i += Q * c;
			}
		}
	}, Qe = class extends Je {};
	l(Qe, "type", "heic");
	var Ze = class extends Je {};
	l(Ze, "type", "avif"), I.set("heic", Qe), I.set("avif", Ze), d(S, ["ifd0", "ifd1"], [
		[256, "ImageWidth"],
		[257, "ImageHeight"],
		[258, "BitsPerSample"],
		[259, "Compression"],
		[262, "PhotometricInterpretation"],
		[270, "ImageDescription"],
		[271, "Make"],
		[272, "Model"],
		[273, "StripOffsets"],
		[274, "Orientation"],
		[277, "SamplesPerPixel"],
		[278, "RowsPerStrip"],
		[279, "StripByteCounts"],
		[282, "XResolution"],
		[283, "YResolution"],
		[284, "PlanarConfiguration"],
		[296, "ResolutionUnit"],
		[301, "TransferFunction"],
		[305, "Software"],
		[306, "ModifyDate"],
		[315, "Artist"],
		[316, "HostComputer"],
		[317, "Predictor"],
		[318, "WhitePoint"],
		[319, "PrimaryChromaticities"],
		[513, "ThumbnailOffset"],
		[514, "ThumbnailLength"],
		[529, "YCbCrCoefficients"],
		[530, "YCbCrSubSampling"],
		[531, "YCbCrPositioning"],
		[532, "ReferenceBlackWhite"],
		[700, "ApplicationNotes"],
		[33432, "Copyright"],
		[33723, "IPTC"],
		[34665, "ExifIFD"],
		[34675, "ICC"],
		[34853, "GpsIFD"],
		[330, "SubIFD"],
		[40965, "InteropIFD"],
		[40091, "XPTitle"],
		[40092, "XPComment"],
		[40093, "XPAuthor"],
		[40094, "XPKeywords"],
		[40095, "XPSubject"]
	]), d(S, "exif", [
		[33434, "ExposureTime"],
		[33437, "FNumber"],
		[34850, "ExposureProgram"],
		[34852, "SpectralSensitivity"],
		[34855, "ISO"],
		[34858, "TimeZoneOffset"],
		[34859, "SelfTimerMode"],
		[34864, "SensitivityType"],
		[34865, "StandardOutputSensitivity"],
		[34866, "RecommendedExposureIndex"],
		[34867, "ISOSpeed"],
		[34868, "ISOSpeedLatitudeyyy"],
		[34869, "ISOSpeedLatitudezzz"],
		[36864, "ExifVersion"],
		[36867, "DateTimeOriginal"],
		[36868, "CreateDate"],
		[36873, "GooglePlusUploadCode"],
		[36880, "OffsetTime"],
		[36881, "OffsetTimeOriginal"],
		[36882, "OffsetTimeDigitized"],
		[37121, "ComponentsConfiguration"],
		[37122, "CompressedBitsPerPixel"],
		[37377, "ShutterSpeedValue"],
		[37378, "ApertureValue"],
		[37379, "BrightnessValue"],
		[37380, "ExposureCompensation"],
		[37381, "MaxApertureValue"],
		[37382, "SubjectDistance"],
		[37383, "MeteringMode"],
		[37384, "LightSource"],
		[37385, "Flash"],
		[37386, "FocalLength"],
		[37393, "ImageNumber"],
		[37394, "SecurityClassification"],
		[37395, "ImageHistory"],
		[37396, "SubjectArea"],
		[37500, "MakerNote"],
		[37510, "UserComment"],
		[37520, "SubSecTime"],
		[37521, "SubSecTimeOriginal"],
		[37522, "SubSecTimeDigitized"],
		[37888, "AmbientTemperature"],
		[37889, "Humidity"],
		[37890, "Pressure"],
		[37891, "WaterDepth"],
		[37892, "Acceleration"],
		[37893, "CameraElevationAngle"],
		[40960, "FlashpixVersion"],
		[40961, "ColorSpace"],
		[40962, "ExifImageWidth"],
		[40963, "ExifImageHeight"],
		[40964, "RelatedSoundFile"],
		[41483, "FlashEnergy"],
		[41486, "FocalPlaneXResolution"],
		[41487, "FocalPlaneYResolution"],
		[41488, "FocalPlaneResolutionUnit"],
		[41492, "SubjectLocation"],
		[41493, "ExposureIndex"],
		[41495, "SensingMethod"],
		[41728, "FileSource"],
		[41729, "SceneType"],
		[41730, "CFAPattern"],
		[41985, "CustomRendered"],
		[41986, "ExposureMode"],
		[41987, "WhiteBalance"],
		[41988, "DigitalZoomRatio"],
		[41989, "FocalLengthIn35mmFormat"],
		[41990, "SceneCaptureType"],
		[41991, "GainControl"],
		[41992, "Contrast"],
		[41993, "Saturation"],
		[41994, "Sharpness"],
		[41996, "SubjectDistanceRange"],
		[42016, "ImageUniqueID"],
		[42032, "OwnerName"],
		[42033, "SerialNumber"],
		[42034, "LensInfo"],
		[42035, "LensMake"],
		[42036, "LensModel"],
		[42037, "LensSerialNumber"],
		[42080, "CompositeImage"],
		[42081, "CompositeImageCount"],
		[42082, "CompositeImageExposureTimes"],
		[42240, "Gamma"],
		[59932, "Padding"],
		[59933, "OffsetSchema"],
		[65e3, "OwnerName"],
		[65001, "SerialNumber"],
		[65002, "Lens"],
		[65100, "RawFile"],
		[65101, "Converter"],
		[65102, "WhiteBalance"],
		[65105, "Exposure"],
		[65106, "Shadows"],
		[65107, "Brightness"],
		[65108, "Contrast"],
		[65109, "Saturation"],
		[65110, "Sharpness"],
		[65111, "Smoothness"],
		[65112, "MoireFilter"],
		[40965, "InteropIFD"]
	]), d(S, "gps", [
		[0, "GPSVersionID"],
		[1, "GPSLatitudeRef"],
		[2, "GPSLatitude"],
		[3, "GPSLongitudeRef"],
		[4, "GPSLongitude"],
		[5, "GPSAltitudeRef"],
		[6, "GPSAltitude"],
		[7, "GPSTimeStamp"],
		[8, "GPSSatellites"],
		[9, "GPSStatus"],
		[10, "GPSMeasureMode"],
		[11, "GPSDOP"],
		[12, "GPSSpeedRef"],
		[13, "GPSSpeed"],
		[14, "GPSTrackRef"],
		[15, "GPSTrack"],
		[16, "GPSImgDirectionRef"],
		[17, "GPSImgDirection"],
		[18, "GPSMapDatum"],
		[19, "GPSDestLatitudeRef"],
		[20, "GPSDestLatitude"],
		[21, "GPSDestLongitudeRef"],
		[22, "GPSDestLongitude"],
		[23, "GPSDestBearingRef"],
		[24, "GPSDestBearing"],
		[25, "GPSDestDistanceRef"],
		[26, "GPSDestDistance"],
		[27, "GPSProcessingMethod"],
		[28, "GPSAreaInformation"],
		[29, "GPSDateStamp"],
		[30, "GPSDifferential"],
		[31, "GPSHPositioningError"]
	]), d(C, ["ifd0", "ifd1"], [[274, {
		1: "Horizontal (normal)",
		2: "Mirror horizontal",
		3: "Rotate 180",
		4: "Mirror vertical",
		5: "Mirror horizontal and rotate 270 CW",
		6: "Rotate 90 CW",
		7: "Mirror horizontal and rotate 90 CW",
		8: "Rotate 270 CW"
	}], [296, {
		1: "None",
		2: "inches",
		3: "cm"
	}]]);
	let $ = d(C, "exif", [
		[34850, {
			0: "Not defined",
			1: "Manual",
			2: "Normal program",
			3: "Aperture priority",
			4: "Shutter priority",
			5: "Creative program",
			6: "Action program",
			7: "Portrait mode",
			8: "Landscape mode"
		}],
		[37121, {
			0: "-",
			1: "Y",
			2: "Cb",
			3: "Cr",
			4: "R",
			5: "G",
			6: "B"
		}],
		[37383, {
			0: "Unknown",
			1: "Average",
			2: "CenterWeightedAverage",
			3: "Spot",
			4: "MultiSpot",
			5: "Pattern",
			6: "Partial",
			255: "Other"
		}],
		[37384, {
			0: "Unknown",
			1: "Daylight",
			2: "Fluorescent",
			3: "Tungsten (incandescent light)",
			4: "Flash",
			9: "Fine weather",
			10: "Cloudy weather",
			11: "Shade",
			12: "Daylight fluorescent (D 5700 - 7100K)",
			13: "Day white fluorescent (N 4600 - 5400K)",
			14: "Cool white fluorescent (W 3900 - 4500K)",
			15: "White fluorescent (WW 3200 - 3700K)",
			17: "Standard light A",
			18: "Standard light B",
			19: "Standard light C",
			20: "D55",
			21: "D65",
			22: "D75",
			23: "D50",
			24: "ISO studio tungsten",
			255: "Other"
		}],
		[37385, {
			0: "Flash did not fire",
			1: "Flash fired",
			5: "Strobe return light not detected",
			7: "Strobe return light detected",
			9: "Flash fired, compulsory flash mode",
			13: "Flash fired, compulsory flash mode, return light not detected",
			15: "Flash fired, compulsory flash mode, return light detected",
			16: "Flash did not fire, compulsory flash mode",
			24: "Flash did not fire, auto mode",
			25: "Flash fired, auto mode",
			29: "Flash fired, auto mode, return light not detected",
			31: "Flash fired, auto mode, return light detected",
			32: "No flash function",
			65: "Flash fired, red-eye reduction mode",
			69: "Flash fired, red-eye reduction mode, return light not detected",
			71: "Flash fired, red-eye reduction mode, return light detected",
			73: "Flash fired, compulsory flash mode, red-eye reduction mode",
			77: "Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected",
			79: "Flash fired, compulsory flash mode, red-eye reduction mode, return light detected",
			89: "Flash fired, auto mode, red-eye reduction mode",
			93: "Flash fired, auto mode, return light not detected, red-eye reduction mode",
			95: "Flash fired, auto mode, return light detected, red-eye reduction mode"
		}],
		[41495, {
			1: "Not defined",
			2: "One-chip color area sensor",
			3: "Two-chip color area sensor",
			4: "Three-chip color area sensor",
			5: "Color sequential area sensor",
			7: "Trilinear sensor",
			8: "Color sequential linear sensor"
		}],
		[41728, {
			1: "Film Scanner",
			2: "Reflection Print Scanner",
			3: "Digital Camera"
		}],
		[41729, { 1: "Directly photographed" }],
		[41985, {
			0: "Normal",
			1: "Custom",
			2: "HDR (no original saved)",
			3: "HDR (original saved)",
			4: "Original (for HDR)",
			6: "Panorama",
			7: "Portrait HDR",
			8: "Portrait"
		}],
		[41986, {
			0: "Auto",
			1: "Manual",
			2: "Auto bracket"
		}],
		[41987, {
			0: "Auto",
			1: "Manual"
		}],
		[41990, {
			0: "Standard",
			1: "Landscape",
			2: "Portrait",
			3: "Night",
			4: "Other"
		}],
		[41991, {
			0: "None",
			1: "Low gain up",
			2: "High gain up",
			3: "Low gain down",
			4: "High gain down"
		}],
		[41996, {
			0: "Unknown",
			1: "Macro",
			2: "Close",
			3: "Distant"
		}],
		[42080, {
			0: "Unknown",
			1: "Not a Composite Image",
			2: "General Composite Image",
			3: "Composite Image Captured While Shooting"
		}]
	]);
	const et = {
		1: "No absolute unit of measurement",
		2: "Inch",
		3: "Centimeter"
	};
	$.set(37392, et), $.set(41488, et);
	const Oe = {
		0: "Normal",
		1: "Low",
		2: "High"
	};
	function tt(e) {
		return typeof e == "object" && e.length !== void 0 ? e[0] : e;
	}
	function it(e) {
		let t = Array.from(e).slice(1);
		return t[1] > 15 && (t = t.map(((i) => String.fromCharCode(i)))), t[2] !== "0" && t[2] !== 0 || t.pop(), t.join(".");
	}
	function xe(e) {
		if (typeof e == "string") {
			var [t, i, n, r, s, a] = e.trim().split(/[-: ]/g).map(Number), o = new Date(t, i - 1, n);
			return Number.isNaN(r) || Number.isNaN(s) || Number.isNaN(a) || (o.setHours(r), o.setMinutes(s), o.setSeconds(a)), Number.isNaN(+o) ? e : o;
		}
	}
	function q(e) {
		if (typeof e == "string") return e;
		let t = [];
		if (e[1] === 0 && e[e.length - 1] === 0) for (let i = 0; i < e.length; i += 2) t.push(nt(e[i + 1], e[i]));
		else for (let i = 0; i < e.length; i += 2) t.push(nt(e[i], e[i + 1]));
		return L(String.fromCodePoint(...t));
	}
	function nt(e, t) {
		return e << 8 | t;
	}
	$.set(41992, Oe), $.set(41993, Oe), $.set(41994, Oe), d(D, ["ifd0", "ifd1"], [
		[50827, function(e) {
			return typeof e != "string" ? Ge(e) : e;
		}],
		[306, xe],
		[40091, q],
		[40092, q],
		[40093, q],
		[40094, q],
		[40095, q]
	]), d(D, "exif", [
		[40960, it],
		[36864, it],
		[36867, xe],
		[36868, xe],
		[40962, tt],
		[40963, tt]
	]), d(D, "gps", [[0, (e) => Array.from(e).join(".")], [7, (e) => Array.from(e).join(":")]]);
	var Me = class extends b {
		static canHandle(e, t) {
			return e.getUint8(t + 1) === 225 && e.getUint32(t + 4) === 1752462448 && e.getString(t + 4, 20) === "http://ns.adobe.com/";
		}
		static headerLength(e, t) {
			return e.getString(t + 4, 34) === "http://ns.adobe.com/xmp/extension/" ? 79 : 33;
		}
		static findPosition(e, t) {
			let i = super.findPosition(e, t);
			return i.multiSegment = i.extended = i.headerLength === 79, i.multiSegment ? (i.chunkCount = e.getUint8(t + 72), i.chunkNumber = e.getUint8(t + 76), e.getUint8(t + 77) !== 0 && i.chunkNumber++) : (i.chunkCount = 1 / 0, i.chunkNumber = -1), i;
		}
		static handleMultiSegments(e) {
			return e.map(((t) => t.chunk.getString())).join("");
		}
		normalizeInput(e) {
			return typeof e == "string" ? e : A.from(e).getString();
		}
		parse(e = this.chunk) {
			if (!this.localOptions.parse) return e;
			e = (function(r) {
				let s = {}, a = {};
				for (let o of lt) s[o] = [], a[o] = 0;
				return r.replace(Nt, ((o, h, c) => {
					if (h === "<") {
						let u = ++a[c];
						return s[c].push(u), `${o}#${u}`;
					}
					return `${o}#${s[c].pop()}`;
				}));
			})(e);
			let t = rt.findAll(e, "rdf", "Description");
			t.length === 0 && t.push(new rt("rdf", "Description", void 0, e));
			let i, n = {};
			for (let r of t) for (let s of r.properties) i = Et(s.ns, n), st(s, i);
			return (function(r) {
				let s;
				for (let a in r) s = r[a] = re(r[a]), s === void 0 && delete r[a];
				return re(r);
			})(n);
		}
		assignToOutput(e, t) {
			if (this.localOptions.parse) for (let [i, n] of Object.entries(t)) switch (i) {
				case "tiff":
					this.assignObjectToOutput(e, "ifd0", n);
					break;
				case "exif":
					this.assignObjectToOutput(e, "exif", n);
					break;
				case "xmlns": break;
				default: this.assignObjectToOutput(e, i, n);
			}
			else e.xmp = t;
		}
	};
	l(Me, "type", "xmp"), l(Me, "multiSegment", !0), g.set("xmp", Me);
	var Ut = class Be {
		static findAll(t) {
			return at(t, /([a-zA-Z0-9-]+):([a-zA-Z0-9-]+)=("[^"]*"|'[^']*')/gm).map(Be.unpackMatch);
		}
		static unpackMatch(t) {
			let i = t[1], n = t[2], r = t[3].slice(1, -1);
			return r = ot(r), new Be(i, n, r);
		}
		constructor(t, i, n) {
			this.ns = t, this.name = i, this.value = n;
		}
		serialize() {
			return this.value;
		}
	}, rt = class fe {
		static findAll(t, i, n) {
			if (i !== void 0 || n !== void 0) {
				i = i || "[\\w\\d-]+", n = n || "[\\w\\d-]+";
				var r = new RegExp(`<(${i}):(${n})(#\\d+)?((\\s+?[\\w\\d-:]+=("[^"]*"|'[^']*'))*\\s*)(\\/>|>([\\s\\S]*?)<\\/\\1:\\2\\3>)`, "gm");
			} else r = /<([\w\d-]+):([\w\d-]+)(#\d+)?((\s+?[\w\d-:]+=("[^"]*"|'[^']*'))*\s*)(\/>|>([\s\S]*?)<\/\1:\2\3>)/gm;
			return at(t, r).map(fe.unpackMatch);
		}
		static unpackMatch(t) {
			let i = t[1], n = t[2], r = t[4], s = t[8];
			return new fe(i, n, r, s);
		}
		constructor(t, i, n, r) {
			this.ns = t, this.name = i, this.attrString = n, this.innerXml = r, this.attrs = Ut.findAll(n), this.children = fe.findAll(r), this.value = this.children.length === 0 ? ot(r) : void 0, this.properties = [...this.attrs, ...this.children];
		}
		get isPrimitive() {
			return this.value !== void 0 && this.attrs.length === 0 && this.children.length === 0;
		}
		get isListContainer() {
			return this.children.length === 1 && this.children[0].isList;
		}
		get isList() {
			let { ns: t, name: i } = this;
			return t === "rdf" && (i === "Seq" || i === "Bag" || i === "Alt");
		}
		get isListItem() {
			return this.ns === "rdf" && this.name === "li";
		}
		serialize() {
			if (this.properties.length === 0 && this.value === void 0) return;
			if (this.isPrimitive) return this.value;
			if (this.isListContainer) return this.children[0].serialize();
			if (this.isList) return Bt(this.children.map(Ft));
			if (this.isListItem && this.children.length === 1 && this.attrs.length === 0) return this.children[0].serialize();
			let t = {};
			for (let i of this.properties) st(i, t);
			return this.value !== void 0 && (t.value = this.value), re(t);
		}
	};
	function st(e, t) {
		let i = e.serialize();
		i !== void 0 && (t[e.name] = i);
	}
	var Ft = (e) => e.serialize(), Bt = (e) => e.length === 1 ? e[0] : e, Et = (e, t) => t[e] ? t[e] : t[e] = {};
	function at(e, t) {
		let i, n = [];
		if (!e) return n;
		for (; (i = t.exec(e)) !== null;) n.push(i);
		return n;
	}
	function ot(e) {
		if ((function(n) {
			return n == null || n === "null" || n === "undefined" || n === "" || n.trim() === "";
		})(e)) return;
		let t = Number(e);
		if (!Number.isNaN(t)) return t;
		let i = e.toLowerCase();
		return i === "true" || i !== "false" && e.trim();
	}
	const lt = [
		"rdf:li",
		"rdf:Seq",
		"rdf:Bag",
		"rdf:Alt",
		"rdf:Description"
	], Nt = new RegExp(`(<|\\/)(${lt.join("|")})`, "g");
	var Gt = Object.freeze({
		__proto__: null,
		default: Rt,
		Exifr: R,
		fileParsers: I,
		segmentParsers: g,
		fileReaders: w,
		tagKeys: S,
		tagValues: C,
		tagRevivers: D,
		createDictionary: d,
		extendDictionary: B,
		fetchUrlAsArrayBuffer: U,
		readBlobAsArrayBuffer: F,
		chunkedProps: v,
		otherSegments: z,
		segments: E,
		tiffBlocks: f,
		segmentsAndBlocks: O,
		tiffExtractables: x,
		inheritables: H,
		allFormatters: M,
		Options: N,
		parse: ae,
		gpsOnlyOptions: ke,
		gps: Xe,
		thumbnailOnlyOptions: Te,
		thumbnail: _e,
		thumbnailUrl: Ye,
		orientationOnlyOptions: Ae,
		orientation: De,
		rotations: ve,
		get rotateCanvas() {
			return G;
		},
		get rotateCss() {
			return V;
		},
		rotation: $e
	});
	let ht = ne("fs", ((e) => e.promises));
	w.set("fs", class extends le {
		async readWhole() {
			this.chunked = !1, this.fs = await ht;
			let e = await this.fs.readFile(this.input);
			this._swapBuffer(e);
		}
		async readChunked() {
			this.chunked = !0, this.fs = await ht, await this.open(), await this.readChunk(0, this.options.firstChunkSize);
		}
		async open() {
			this.fh === void 0 && (this.fh = await this.fs.open(this.input, "r"), this.size = (await this.fh.stat(this.input)).size);
		}
		async _readChunk(e, t) {
			this.fh === void 0 && await this.open(), e + t > this.size && (t = this.size - e);
			var i = this.subarray(e, t, !0);
			return await this.fh.read(i.dataView, 0, t, e), i;
		}
		async close() {
			if (this.fh) {
				let e = this.fh;
				this.fh = void 0, await e.close();
			}
		}
	}), w.set("base64", class extends le {
		constructor(...e) {
			super(...e), this.input = this.input.replace(/^data:([^;]+);base64,/gim, ""), this.size = this.input.length / 4 * 3, this.input.endsWith("==") ? this.size -= 2 : this.input.endsWith("=") && (this.size -= 1);
		}
		async _readChunk(e, t) {
			let i, n, r = this.input;
			e === void 0 ? (e = 0, i = 0, n = 0) : (i = 4 * Math.floor(e / 3), n = e - i / 4 * 3), t === void 0 && (t = this.size);
			let s = e + t, a = i + 4 * Math.ceil(s / 3);
			r = r.slice(i, a);
			let o = Math.min(t, this.size - e);
			if (ie) {
				let h = te.from(r, "base64").slice(n, n + o);
				return this.set(h, e, !0);
			}
			{
				let h = this.subarray(e, o, !0), c = atob(r), u = h.toUint8();
				for (let p = 0; p < o; p++) u[p] = c.charCodeAt(n + p);
				return h;
			}
		}
	});
	var ct = class extends oe {
		static canHandle(e, t) {
			return t === 18761 || t === 19789;
		}
		extendOptions(e) {
			let { ifd0: t, xmp: i, iptc: n, icc: r } = e;
			i.enabled && t.deps.add(700), n.enabled && t.deps.add(33723), r.enabled && t.deps.add(34675), t.finalizeFilters();
		}
		async parse() {
			let { tiff: e, xmp: t, iptc: i, icc: n } = this.options;
			if (e.enabled || t.enabled || i.enabled || n.enabled) {
				let r = Math.max(pe(this.options), this.options.chunkSize);
				await this.file.ensureChunk(0, r), this.createParser("tiff", this.file), this.parsers.tiff.parseHeader(), await this.parsers.tiff.parseIfd0Block(), this.adaptTiffPropAsSegment("xmp"), this.adaptTiffPropAsSegment("iptc"), this.adaptTiffPropAsSegment("icc");
			}
		}
		adaptTiffPropAsSegment(e) {
			if (this.parsers.tiff[e]) {
				let t = this.parsers.tiff[e];
				this.injectSegment(e, t);
			}
		}
	};
	l(ct, "type", "tiff"), I.set("tiff", ct);
	let Vt = ne("zlib");
	const zt = [
		"ihdr",
		"iccp",
		"text",
		"itxt",
		"exif"
	];
	var ut = class extends oe {
		constructor(...e) {
			super(...e), l(this, "catchError", ((t) => this.errors.push(t))), l(this, "metaChunks", []), l(this, "unknownChunks", []);
		}
		static canHandle(e, t) {
			return t === 35152 && e.getUint32(0) === 2303741511 && e.getUint32(4) === 218765834;
		}
		async parse() {
			let { file: e } = this;
			await this.findPngChunksInRange(8, e.byteLength), await this.readSegments(this.metaChunks), this.findIhdr(), this.parseTextChunks(), await this.findExif().catch(this.catchError), await this.findXmp().catch(this.catchError), await this.findIcc().catch(this.catchError);
		}
		async findPngChunksInRange(e, t) {
			let { file: i } = this;
			for (; e < t;) {
				let n = i.getUint32(e), r = i.getUint32(e + 4), s = i.getString(e + 4, 4).toLowerCase(), a = n + 4 + 4 + 4, o = {
					type: s,
					offset: e,
					length: a,
					start: e + 4 + 4,
					size: n,
					marker: r
				};
				zt.includes(s) ? this.metaChunks.push(o) : this.unknownChunks.push(o), e += a;
			}
		}
		parseTextChunks() {
			let e = this.metaChunks.filter(((t) => t.type === "text"));
			for (let t of e) {
				let [i, n] = this.file.getString(t.start, t.size).split("\0");
				this.injectKeyValToIhdr(i, n);
			}
		}
		injectKeyValToIhdr(e, t) {
			let i = this.parsers.ihdr;
			i && i.raw.set(e, t);
		}
		findIhdr() {
			let e = this.metaChunks.find(((t) => t.type === "ihdr"));
			e && this.options.ihdr.enabled !== !1 && this.createParser("ihdr", e.chunk);
		}
		async findExif() {
			let e = this.metaChunks.find(((t) => t.type === "exif"));
			e && this.injectSegment("tiff", e.chunk);
		}
		async findXmp() {
			let e = this.metaChunks.filter(((t) => t.type === "itxt"));
			for (let t of e) t.chunk.getString(0, 17) === "XML:com.adobe.xmp" && this.injectSegment("xmp", t.chunk);
		}
		async findIcc() {
			let e = this.metaChunks.find(((a) => a.type === "iccp"));
			if (!e) return;
			let { chunk: t } = e, i = t.getUint8Array(0, 81), n = 0;
			for (; n < 80 && i[n] !== 0;) n++;
			let r = n + 2, s = t.getString(0, n);
			if (this.injectKeyValToIhdr("ProfileName", s), ee) {
				let a = await Vt, o = t.getUint8Array(r);
				o = a.inflateSync(o), this.injectSegment("icc", o);
			}
		}
	};
	l(ut, "type", "png"), I.set("png", ut), d(S, "interop", [
		[1, "InteropIndex"],
		[2, "InteropVersion"],
		[4096, "RelatedImageFileFormat"],
		[4097, "RelatedImageWidth"],
		[4098, "RelatedImageHeight"]
	]), B(S, "ifd0", [
		[11, "ProcessingSoftware"],
		[254, "SubfileType"],
		[255, "OldSubfileType"],
		[263, "Thresholding"],
		[264, "CellWidth"],
		[265, "CellLength"],
		[266, "FillOrder"],
		[269, "DocumentName"],
		[280, "MinSampleValue"],
		[281, "MaxSampleValue"],
		[285, "PageName"],
		[286, "XPosition"],
		[287, "YPosition"],
		[290, "GrayResponseUnit"],
		[297, "PageNumber"],
		[321, "HalftoneHints"],
		[322, "TileWidth"],
		[323, "TileLength"],
		[332, "InkSet"],
		[337, "TargetPrinter"],
		[18246, "Rating"],
		[18249, "RatingPercent"],
		[33550, "PixelScale"],
		[34264, "ModelTransform"],
		[34377, "PhotoshopSettings"],
		[50706, "DNGVersion"],
		[50707, "DNGBackwardVersion"],
		[50708, "UniqueCameraModel"],
		[50709, "LocalizedCameraModel"],
		[50736, "DNGLensInfo"],
		[50739, "ShadowScale"],
		[50740, "DNGPrivateData"],
		[33920, "IntergraphMatrix"],
		[33922, "ModelTiePoint"],
		[34118, "SEMInfo"],
		[34735, "GeoTiffDirectory"],
		[34736, "GeoTiffDoubleParams"],
		[34737, "GeoTiffAsciiParams"],
		[50341, "PrintIM"],
		[50721, "ColorMatrix1"],
		[50722, "ColorMatrix2"],
		[50723, "CameraCalibration1"],
		[50724, "CameraCalibration2"],
		[50725, "ReductionMatrix1"],
		[50726, "ReductionMatrix2"],
		[50727, "AnalogBalance"],
		[50728, "AsShotNeutral"],
		[50729, "AsShotWhiteXY"],
		[50730, "BaselineExposure"],
		[50731, "BaselineNoise"],
		[50732, "BaselineSharpness"],
		[50734, "LinearResponseLimit"],
		[50735, "CameraSerialNumber"],
		[50741, "MakerNoteSafety"],
		[50778, "CalibrationIlluminant1"],
		[50779, "CalibrationIlluminant2"],
		[50781, "RawDataUniqueID"],
		[50827, "OriginalRawFileName"],
		[50828, "OriginalRawFileData"],
		[50831, "AsShotICCProfile"],
		[50832, "AsShotPreProfileMatrix"],
		[50833, "CurrentICCProfile"],
		[50834, "CurrentPreProfileMatrix"],
		[50879, "ColorimetricReference"],
		[50885, "SRawType"],
		[50898, "PanasonicTitle"],
		[50899, "PanasonicTitle2"],
		[50931, "CameraCalibrationSig"],
		[50932, "ProfileCalibrationSig"],
		[50933, "ProfileIFD"],
		[50934, "AsShotProfileName"],
		[50936, "ProfileName"],
		[50937, "ProfileHueSatMapDims"],
		[50938, "ProfileHueSatMapData1"],
		[50939, "ProfileHueSatMapData2"],
		[50940, "ProfileToneCurve"],
		[50941, "ProfileEmbedPolicy"],
		[50942, "ProfileCopyright"],
		[50964, "ForwardMatrix1"],
		[50965, "ForwardMatrix2"],
		[50966, "PreviewApplicationName"],
		[50967, "PreviewApplicationVersion"],
		[50968, "PreviewSettingsName"],
		[50969, "PreviewSettingsDigest"],
		[50970, "PreviewColorSpace"],
		[50971, "PreviewDateTime"],
		[50972, "RawImageDigest"],
		[50973, "OriginalRawFileDigest"],
		[50981, "ProfileLookTableDims"],
		[50982, "ProfileLookTableData"],
		[51043, "TimeCodes"],
		[51044, "FrameRate"],
		[51058, "TStop"],
		[51081, "ReelName"],
		[51089, "OriginalDefaultFinalSize"],
		[51090, "OriginalBestQualitySize"],
		[51091, "OriginalDefaultCropSize"],
		[51105, "CameraLabel"],
		[51107, "ProfileHueSatMapEncoding"],
		[51108, "ProfileLookTableEncoding"],
		[51109, "BaselineExposureOffset"],
		[51110, "DefaultBlackRender"],
		[51111, "NewRawImageDigest"],
		[51112, "RawToPreviewGain"]
	]);
	let ft = [
		[273, "StripOffsets"],
		[279, "StripByteCounts"],
		[288, "FreeOffsets"],
		[289, "FreeByteCounts"],
		[291, "GrayResponseCurve"],
		[292, "T4Options"],
		[293, "T6Options"],
		[300, "ColorResponseUnit"],
		[320, "ColorMap"],
		[324, "TileOffsets"],
		[325, "TileByteCounts"],
		[326, "BadFaxLines"],
		[327, "CleanFaxData"],
		[328, "ConsecutiveBadFaxLines"],
		[330, "SubIFD"],
		[333, "InkNames"],
		[334, "NumberofInks"],
		[336, "DotRange"],
		[338, "ExtraSamples"],
		[339, "SampleFormat"],
		[340, "SMinSampleValue"],
		[341, "SMaxSampleValue"],
		[342, "TransferRange"],
		[343, "ClipPath"],
		[344, "XClipPathUnits"],
		[345, "YClipPathUnits"],
		[346, "Indexed"],
		[347, "JPEGTables"],
		[351, "OPIProxy"],
		[400, "GlobalParametersIFD"],
		[401, "ProfileType"],
		[402, "FaxProfile"],
		[403, "CodingMethods"],
		[404, "VersionYear"],
		[405, "ModeNumber"],
		[433, "Decode"],
		[434, "DefaultImageColor"],
		[435, "T82Options"],
		[437, "JPEGTables"],
		[512, "JPEGProc"],
		[515, "JPEGRestartInterval"],
		[517, "JPEGLosslessPredictors"],
		[518, "JPEGPointTransforms"],
		[519, "JPEGQTables"],
		[520, "JPEGDCTables"],
		[521, "JPEGACTables"],
		[559, "StripRowCounts"],
		[999, "USPTOMiscellaneous"],
		[18247, "XP_DIP_XML"],
		[18248, "StitchInfo"],
		[28672, "SonyRawFileType"],
		[28688, "SonyToneCurve"],
		[28721, "VignettingCorrection"],
		[28722, "VignettingCorrParams"],
		[28724, "ChromaticAberrationCorrection"],
		[28725, "ChromaticAberrationCorrParams"],
		[28726, "DistortionCorrection"],
		[28727, "DistortionCorrParams"],
		[29895, "SonyCropTopLeft"],
		[29896, "SonyCropSize"],
		[32781, "ImageID"],
		[32931, "WangTag1"],
		[32932, "WangAnnotation"],
		[32933, "WangTag3"],
		[32934, "WangTag4"],
		[32953, "ImageReferencePoints"],
		[32954, "RegionXformTackPoint"],
		[32955, "WarpQuadrilateral"],
		[32956, "AffineTransformMat"],
		[32995, "Matteing"],
		[32996, "DataType"],
		[32997, "ImageDepth"],
		[32998, "TileDepth"],
		[33300, "ImageFullWidth"],
		[33301, "ImageFullHeight"],
		[33302, "TextureFormat"],
		[33303, "WrapModes"],
		[33304, "FovCot"],
		[33305, "MatrixWorldToScreen"],
		[33306, "MatrixWorldToCamera"],
		[33405, "Model2"],
		[33421, "CFARepeatPatternDim"],
		[33422, "CFAPattern2"],
		[33423, "BatteryLevel"],
		[33424, "KodakIFD"],
		[33445, "MDFileTag"],
		[33446, "MDScalePixel"],
		[33447, "MDColorTable"],
		[33448, "MDLabName"],
		[33449, "MDSampleInfo"],
		[33450, "MDPrepDate"],
		[33451, "MDPrepTime"],
		[33452, "MDFileUnits"],
		[33589, "AdventScale"],
		[33590, "AdventRevision"],
		[33628, "UIC1Tag"],
		[33629, "UIC2Tag"],
		[33630, "UIC3Tag"],
		[33631, "UIC4Tag"],
		[33918, "IntergraphPacketData"],
		[33919, "IntergraphFlagRegisters"],
		[33921, "INGRReserved"],
		[34016, "Site"],
		[34017, "ColorSequence"],
		[34018, "IT8Header"],
		[34019, "RasterPadding"],
		[34020, "BitsPerRunLength"],
		[34021, "BitsPerExtendedRunLength"],
		[34022, "ColorTable"],
		[34023, "ImageColorIndicator"],
		[34024, "BackgroundColorIndicator"],
		[34025, "ImageColorValue"],
		[34026, "BackgroundColorValue"],
		[34027, "PixelIntensityRange"],
		[34028, "TransparencyIndicator"],
		[34029, "ColorCharacterization"],
		[34030, "HCUsage"],
		[34031, "TrapIndicator"],
		[34032, "CMYKEquivalent"],
		[34152, "AFCP_IPTC"],
		[34232, "PixelMagicJBIGOptions"],
		[34263, "JPLCartoIFD"],
		[34306, "WB_GRGBLevels"],
		[34310, "LeafData"],
		[34687, "TIFF_FXExtensions"],
		[34688, "MultiProfiles"],
		[34689, "SharedData"],
		[34690, "T88Options"],
		[34732, "ImageLayer"],
		[34750, "JBIGOptions"],
		[34856, "Opto-ElectricConvFactor"],
		[34857, "Interlace"],
		[34908, "FaxRecvParams"],
		[34909, "FaxSubAddress"],
		[34910, "FaxRecvTime"],
		[34929, "FedexEDR"],
		[34954, "LeafSubIFD"],
		[37387, "FlashEnergy"],
		[37388, "SpatialFrequencyResponse"],
		[37389, "Noise"],
		[37390, "FocalPlaneXResolution"],
		[37391, "FocalPlaneYResolution"],
		[37392, "FocalPlaneResolutionUnit"],
		[37397, "ExposureIndex"],
		[37398, "TIFF-EPStandardID"],
		[37399, "SensingMethod"],
		[37434, "CIP3DataFile"],
		[37435, "CIP3Sheet"],
		[37436, "CIP3Side"],
		[37439, "StoNits"],
		[37679, "MSDocumentText"],
		[37680, "MSPropertySetStorage"],
		[37681, "MSDocumentTextPosition"],
		[37724, "ImageSourceData"],
		[40965, "InteropIFD"],
		[40976, "SamsungRawPointersOffset"],
		[40977, "SamsungRawPointersLength"],
		[41217, "SamsungRawByteOrder"],
		[41218, "SamsungRawUnknown"],
		[41484, "SpatialFrequencyResponse"],
		[41485, "Noise"],
		[41489, "ImageNumber"],
		[41490, "SecurityClassification"],
		[41491, "ImageHistory"],
		[41494, "TIFF-EPStandardID"],
		[41995, "DeviceSettingDescription"],
		[42112, "GDALMetadata"],
		[42113, "GDALNoData"],
		[44992, "ExpandSoftware"],
		[44993, "ExpandLens"],
		[44994, "ExpandFilm"],
		[44995, "ExpandFilterLens"],
		[44996, "ExpandScanner"],
		[44997, "ExpandFlashLamp"],
		[46275, "HasselbladRawImage"],
		[48129, "PixelFormat"],
		[48130, "Transformation"],
		[48131, "Uncompressed"],
		[48132, "ImageType"],
		[48256, "ImageWidth"],
		[48257, "ImageHeight"],
		[48258, "WidthResolution"],
		[48259, "HeightResolution"],
		[48320, "ImageOffset"],
		[48321, "ImageByteCount"],
		[48322, "AlphaOffset"],
		[48323, "AlphaByteCount"],
		[48324, "ImageDataDiscard"],
		[48325, "AlphaDataDiscard"],
		[50215, "OceScanjobDesc"],
		[50216, "OceApplicationSelector"],
		[50217, "OceIDNumber"],
		[50218, "OceImageLogic"],
		[50255, "Annotations"],
		[50459, "HasselbladExif"],
		[50547, "OriginalFileName"],
		[50560, "USPTOOriginalContentType"],
		[50656, "CR2CFAPattern"],
		[50710, "CFAPlaneColor"],
		[50711, "CFALayout"],
		[50712, "LinearizationTable"],
		[50713, "BlackLevelRepeatDim"],
		[50714, "BlackLevel"],
		[50715, "BlackLevelDeltaH"],
		[50716, "BlackLevelDeltaV"],
		[50717, "WhiteLevel"],
		[50718, "DefaultScale"],
		[50719, "DefaultCropOrigin"],
		[50720, "DefaultCropSize"],
		[50733, "BayerGreenSplit"],
		[50737, "ChromaBlurRadius"],
		[50738, "AntiAliasStrength"],
		[50752, "RawImageSegmentation"],
		[50780, "BestQualityScale"],
		[50784, "AliasLayerMetadata"],
		[50829, "ActiveArea"],
		[50830, "MaskedAreas"],
		[50935, "NoiseReductionApplied"],
		[50974, "SubTileBlockSize"],
		[50975, "RowInterleaveFactor"],
		[51008, "OpcodeList1"],
		[51009, "OpcodeList2"],
		[51022, "OpcodeList3"],
		[51041, "NoiseProfile"],
		[51114, "CacheVersion"],
		[51125, "DefaultUserCrop"],
		[51157, "NikonNEFInfo"],
		[65024, "KdcIFD"]
	];
	B(S, "ifd0", ft), B(S, "exif", ft), d(C, "gps", [[23, {
		M: "Magnetic North",
		T: "True North"
	}], [25, {
		K: "Kilometers",
		M: "Miles",
		N: "Nautical Miles"
	}]]);
	var Re = class extends b {
		static canHandle(e, t) {
			return e.getUint8(t + 1) === 224 && e.getUint32(t + 4) === 1246120262 && e.getUint8(t + 8) === 0;
		}
		parse() {
			return this.parseTags(), this.translate(), this.output;
		}
		parseTags() {
			this.raw = /* @__PURE__ */ new Map([
				[0, this.chunk.getUint16(0)],
				[2, this.chunk.getUint8(2)],
				[3, this.chunk.getUint16(3)],
				[5, this.chunk.getUint16(5)],
				[7, this.chunk.getUint8(7)],
				[8, this.chunk.getUint8(8)]
			]);
		}
	};
	l(Re, "type", "jfif"), l(Re, "headerLength", 9), g.set("jfif", Re), d(S, "jfif", [
		[0, "JFIFVersion"],
		[2, "ResolutionUnit"],
		[3, "XResolution"],
		[5, "YResolution"],
		[7, "ThumbnailWidth"],
		[8, "ThumbnailHeight"]
	]);
	var dt = class extends b {
		parse() {
			return this.parseTags(), this.translate(), this.output;
		}
		parseTags() {
			this.raw = new Map([
				[0, this.chunk.getUint32(0)],
				[4, this.chunk.getUint32(4)],
				[8, this.chunk.getUint8(8)],
				[9, this.chunk.getUint8(9)],
				[10, this.chunk.getUint8(10)],
				[11, this.chunk.getUint8(11)],
				[12, this.chunk.getUint8(12)],
				...Array.from(this.raw)
			]);
		}
	};
	l(dt, "type", "ihdr"), g.set("ihdr", dt), d(S, "ihdr", [
		[0, "ImageWidth"],
		[4, "ImageHeight"],
		[8, "BitDepth"],
		[9, "ColorType"],
		[10, "Compression"],
		[11, "Filter"],
		[12, "Interlace"]
	]), d(C, "ihdr", [
		[9, {
			0: "Grayscale",
			2: "RGB",
			3: "Palette",
			4: "Grayscale with Alpha",
			6: "RGB with Alpha",
			DEFAULT: "Unknown"
		}],
		[10, {
			0: "Deflate/Inflate",
			DEFAULT: "Unknown"
		}],
		[11, {
			0: "Adaptive",
			DEFAULT: "Unknown"
		}],
		[12, {
			0: "Noninterlaced",
			1: "Adam7 Interlace",
			DEFAULT: "Unknown"
		}]
	]);
	var he = class extends b {
		static canHandle(e, t) {
			return e.getUint8(t + 1) === 226 && e.getUint32(t + 4) === 1229144927;
		}
		static findPosition(e, t) {
			let i = super.findPosition(e, t);
			return i.chunkNumber = e.getUint8(t + 16), i.chunkCount = e.getUint8(t + 17), i.multiSegment = i.chunkCount > 1, i;
		}
		static handleMultiSegments(e) {
			return (function(t) {
				return new A((function(n) {
					let r = n[0].constructor, s = 0;
					for (let h of n) s += h.length;
					let a = new r(s), o = 0;
					for (let h of n) a.set(h, o), o += h.length;
					return a;
				})(t.map(((n) => n.chunk.toUint8()))));
			})(e);
		}
		parse() {
			return this.raw = /* @__PURE__ */ new Map(), this.parseHeader(), this.parseTags(), this.translate(), this.output;
		}
		parseHeader() {
			let { raw: e } = this;
			this.chunk.byteLength < 84 && m("ICC header is too short");
			for (let [t, i] of Object.entries(Ht)) {
				t = parseInt(t, 10);
				let n = i(this.chunk, t);
				n !== "\0\0\0\0" && e.set(t, n);
			}
		}
		parseTags() {
			let e, t, i, n, r, { raw: s } = this, a = this.chunk.getUint32(128), o = 132, h = this.chunk.byteLength;
			for (; a--;) {
				if (e = this.chunk.getString(o, 4), t = this.chunk.getUint32(o + 4), i = this.chunk.getUint32(o + 8), n = this.chunk.getString(t, 4), t + i > h) return void console.warn("reached the end of the first ICC chunk. Enable options.tiff.multiSegment to read all ICC segments.");
				r = this.parseTag(n, t, i), r !== void 0 && r !== "\0\0\0\0" && s.set(e, r), o += 12;
			}
		}
		parseTag(e, t, i) {
			switch (e) {
				case "desc": return this.parseDesc(t);
				case "mluc": return this.parseMluc(t);
				case "text": return this.parseText(t, i);
				case "sig ": return this.parseSig(t);
			}
			if (!(t + i > this.chunk.byteLength)) return this.chunk.getUint8Array(t, i);
		}
		parseDesc(e) {
			let t = this.chunk.getUint32(e + 8) - 1;
			return L(this.chunk.getString(e + 12, t));
		}
		parseText(e, t) {
			return L(this.chunk.getString(e + 8, t - 8));
		}
		parseSig(e) {
			return L(this.chunk.getString(e + 8, 4));
		}
		parseMluc(e) {
			let { chunk: t } = this, i = t.getUint32(e + 8), n = t.getUint32(e + 12), r = e + 16, s = [];
			for (let a = 0; a < i; a++) {
				let o = t.getString(r + 0, 2), h = t.getString(r + 2, 2), c = t.getUint32(r + 4), u = t.getUint32(r + 8) + e, p = L(t.getUnicodeString(u, c));
				s.push({
					lang: o,
					country: h,
					text: p
				}), r += n;
			}
			return i === 1 ? s[0].text : s;
		}
		translateValue(e, t) {
			return typeof e == "string" ? t[e] || t[e.toLowerCase()] || e : t[e] || e;
		}
	};
	l(he, "type", "icc"), l(he, "multiSegment", !0), l(he, "headerLength", 18);
	const Ht = {
		4: P,
		8: function(e, t) {
			return [
				e.getUint8(t),
				e.getUint8(t + 1) >> 4,
				e.getUint8(t + 1) % 16
			].map(((i) => i.toString(10))).join(".");
		},
		12: P,
		16: P,
		20: P,
		24: function(e, t) {
			const i = e.getUint16(t), n = e.getUint16(t + 2) - 1, r = e.getUint16(t + 4), s = e.getUint16(t + 6), a = e.getUint16(t + 8), o = e.getUint16(t + 10);
			return new Date(Date.UTC(i, n, r, s, a, o));
		},
		36: P,
		40: P,
		48: P,
		52: P,
		64: (e, t) => e.getUint32(t),
		80: P
	};
	function P(e, t) {
		return L(e.getString(t, 4));
	}
	g.set("icc", he), d(S, "icc", [
		[4, "ProfileCMMType"],
		[8, "ProfileVersion"],
		[12, "ProfileClass"],
		[16, "ColorSpaceData"],
		[20, "ProfileConnectionSpace"],
		[24, "ProfileDateTime"],
		[36, "ProfileFileSignature"],
		[40, "PrimaryPlatform"],
		[44, "CMMFlags"],
		[48, "DeviceManufacturer"],
		[52, "DeviceModel"],
		[56, "DeviceAttributes"],
		[64, "RenderingIntent"],
		[68, "ConnectionSpaceIlluminant"],
		[80, "ProfileCreator"],
		[84, "ProfileID"],
		["Header", "ProfileHeader"],
		["MS00", "WCSProfiles"],
		["bTRC", "BlueTRC"],
		["bXYZ", "BlueMatrixColumn"],
		["bfd", "UCRBG"],
		["bkpt", "MediaBlackPoint"],
		["calt", "CalibrationDateTime"],
		["chad", "ChromaticAdaptation"],
		["chrm", "Chromaticity"],
		["ciis", "ColorimetricIntentImageState"],
		["clot", "ColorantTableOut"],
		["clro", "ColorantOrder"],
		["clrt", "ColorantTable"],
		["cprt", "ProfileCopyright"],
		["crdi", "CRDInfo"],
		["desc", "ProfileDescription"],
		["devs", "DeviceSettings"],
		["dmdd", "DeviceModelDesc"],
		["dmnd", "DeviceMfgDesc"],
		["dscm", "ProfileDescriptionML"],
		["fpce", "FocalPlaneColorimetryEstimates"],
		["gTRC", "GreenTRC"],
		["gXYZ", "GreenMatrixColumn"],
		["gamt", "Gamut"],
		["kTRC", "GrayTRC"],
		["lumi", "Luminance"],
		["meas", "Measurement"],
		["meta", "Metadata"],
		["mmod", "MakeAndModel"],
		["ncl2", "NamedColor2"],
		["ncol", "NamedColor"],
		["ndin", "NativeDisplayInfo"],
		["pre0", "Preview0"],
		["pre1", "Preview1"],
		["pre2", "Preview2"],
		["ps2i", "PS2RenderingIntent"],
		["ps2s", "PostScript2CSA"],
		["psd0", "PostScript2CRD0"],
		["psd1", "PostScript2CRD1"],
		["psd2", "PostScript2CRD2"],
		["psd3", "PostScript2CRD3"],
		["pseq", "ProfileSequenceDesc"],
		["psid", "ProfileSequenceIdentifier"],
		["psvm", "PS2CRDVMSize"],
		["rTRC", "RedTRC"],
		["rXYZ", "RedMatrixColumn"],
		["resp", "OutputResponse"],
		["rhoc", "ReflectionHardcopyOrigColorimetry"],
		["rig0", "PerceptualRenderingIntentGamut"],
		["rig2", "SaturationRenderingIntentGamut"],
		["rpoc", "ReflectionPrintOutputColorimetry"],
		["sape", "SceneAppearanceEstimates"],
		["scoe", "SceneColorimetryEstimates"],
		["scrd", "ScreeningDesc"],
		["scrn", "Screening"],
		["targ", "CharTarget"],
		["tech", "Technology"],
		["vcgt", "VideoCardGamma"],
		["view", "ViewingConditions"],
		["vued", "ViewingCondDesc"],
		["wtpt", "MediaWhitePoint"]
	]);
	const ce = {
		"4d2p": "Erdt Systems",
		AAMA: "Aamazing Technologies",
		ACER: "Acer",
		ACLT: "Acolyte Color Research",
		ACTI: "Actix Sytems",
		ADAR: "Adara Technology",
		ADBE: "Adobe",
		ADI: "ADI Systems",
		AGFA: "Agfa Graphics",
		ALMD: "Alps Electric",
		ALPS: "Alps Electric",
		ALWN: "Alwan Color Expertise",
		AMTI: "Amiable Technologies",
		AOC: "AOC International",
		APAG: "Apago",
		APPL: "Apple Computer",
		AST: "AST",
		"AT&T": "AT&T",
		BAEL: "BARBIERI electronic",
		BRCO: "Barco NV",
		BRKP: "Breakpoint",
		BROT: "Brother",
		BULL: "Bull",
		BUS: "Bus Computer Systems",
		"C-IT": "C-Itoh",
		CAMR: "Intel",
		CANO: "Canon",
		CARR: "Carroll Touch",
		CASI: "Casio",
		CBUS: "Colorbus PL",
		CEL: "Crossfield",
		CELx: "Crossfield",
		CGS: "CGS Publishing Technologies International",
		CHM: "Rochester Robotics",
		CIGL: "Colour Imaging Group, London",
		CITI: "Citizen",
		CL00: "Candela",
		CLIQ: "Color IQ",
		CMCO: "Chromaco",
		CMiX: "CHROMiX",
		COLO: "Colorgraphic Communications",
		COMP: "Compaq",
		COMp: "Compeq/Focus Technology",
		CONR: "Conrac Display Products",
		CORD: "Cordata Technologies",
		CPQ: "Compaq",
		CPRO: "ColorPro",
		CRN: "Cornerstone",
		CTX: "CTX International",
		CVIS: "ColorVision",
		CWC: "Fujitsu Laboratories",
		DARI: "Darius Technology",
		DATA: "Dataproducts",
		DCP: "Dry Creek Photo",
		DCRC: "Digital Contents Resource Center, Chung-Ang University",
		DELL: "Dell Computer",
		DIC: "Dainippon Ink and Chemicals",
		DICO: "Diconix",
		DIGI: "Digital",
		"DL&C": "Digital Light & Color",
		DPLG: "Doppelganger",
		DS: "Dainippon Screen",
		DSOL: "DOOSOL",
		DUPN: "DuPont",
		EPSO: "Epson",
		ESKO: "Esko-Graphics",
		ETRI: "Electronics and Telecommunications Research Institute",
		EVER: "Everex Systems",
		EXAC: "ExactCODE",
		Eizo: "Eizo",
		FALC: "Falco Data Products",
		FF: "Fuji Photo Film",
		FFEI: "FujiFilm Electronic Imaging",
		FNRD: "Fnord Software",
		FORA: "Fora",
		FORE: "Forefront Technology",
		FP: "Fujitsu",
		FPA: "WayTech Development",
		FUJI: "Fujitsu",
		FX: "Fuji Xerox",
		GCC: "GCC Technologies",
		GGSL: "Global Graphics Software",
		GMB: "Gretagmacbeth",
		GMG: "GMG",
		GOLD: "GoldStar Technology",
		GOOG: "Google",
		GPRT: "Giantprint",
		GTMB: "Gretagmacbeth",
		GVC: "WayTech Development",
		GW2K: "Sony",
		HCI: "HCI",
		HDM: "Heidelberger Druckmaschinen",
		HERM: "Hermes",
		HITA: "Hitachi America",
		HP: "Hewlett-Packard",
		HTC: "Hitachi",
		HiTi: "HiTi Digital",
		IBM: "IBM",
		IDNT: "Scitex",
		IEC: "Hewlett-Packard",
		IIYA: "Iiyama North America",
		IKEG: "Ikegami Electronics",
		IMAG: "Image Systems",
		IMI: "Ingram Micro",
		INTC: "Intel",
		INTL: "N/A (INTL)",
		INTR: "Intra Electronics",
		IOCO: "Iocomm International Technology",
		IPS: "InfoPrint Solutions Company",
		IRIS: "Scitex",
		ISL: "Ichikawa Soft Laboratory",
		ITNL: "N/A (ITNL)",
		IVM: "IVM",
		IWAT: "Iwatsu Electric",
		Idnt: "Scitex",
		Inca: "Inca Digital Printers",
		Iris: "Scitex",
		JPEG: "Joint Photographic Experts Group",
		JSFT: "Jetsoft Development",
		JVC: "JVC Information Products",
		KART: "Scitex",
		KFC: "KFC Computek Components",
		KLH: "KLH Computers",
		KMHD: "Konica Minolta",
		KNCA: "Konica",
		KODA: "Kodak",
		KYOC: "Kyocera",
		Kart: "Scitex",
		LCAG: "Leica",
		LCCD: "Leeds Colour",
		LDAK: "Left Dakota",
		LEAD: "Leading Technology",
		LEXM: "Lexmark International",
		LINK: "Link Computer",
		LINO: "Linotronic",
		LITE: "Lite-On",
		Leaf: "Leaf",
		Lino: "Linotronic",
		MAGC: "Mag Computronic",
		MAGI: "MAG Innovision",
		MANN: "Mannesmann",
		MICN: "Micron Technology",
		MICR: "Microtek",
		MICV: "Microvitec",
		MINO: "Minolta",
		MITS: "Mitsubishi Electronics America",
		MITs: "Mitsuba",
		MNLT: "Minolta",
		MODG: "Modgraph",
		MONI: "Monitronix",
		MONS: "Monaco Systems",
		MORS: "Morse Technology",
		MOTI: "Motive Systems",
		MSFT: "Microsoft",
		MUTO: "MUTOH INDUSTRIES",
		Mits: "Mitsubishi Electric",
		NANA: "NANAO",
		NEC: "NEC",
		NEXP: "NexPress Solutions",
		NISS: "Nissei Sangyo America",
		NKON: "Nikon",
		NONE: "none",
		OCE: "Oce Technologies",
		OCEC: "OceColor",
		OKI: "Oki",
		OKID: "Okidata",
		OKIP: "Okidata",
		OLIV: "Olivetti",
		OLYM: "Olympus",
		ONYX: "Onyx Graphics",
		OPTI: "Optiquest",
		PACK: "Packard Bell",
		PANA: "Matsushita Electric Industrial",
		PANT: "Pantone",
		PBN: "Packard Bell",
		PFU: "PFU",
		PHIL: "Philips Consumer Electronics",
		PNTX: "HOYA",
		POne: "Phase One A/S",
		PREM: "Premier Computer Innovations",
		PRIN: "Princeton Graphic Systems",
		PRIP: "Princeton Publishing Labs",
		QLUX: "Hong Kong",
		QMS: "QMS",
		QPCD: "QPcard AB",
		QUAD: "QuadLaser",
		QUME: "Qume",
		RADI: "Radius",
		RDDx: "Integrated Color Solutions",
		RDG: "Roland DG",
		REDM: "REDMS Group",
		RELI: "Relisys",
		RGMS: "Rolf Gierling Multitools",
		RICO: "Ricoh",
		RNLD: "Edmund Ronald",
		ROYA: "Royal",
		RPC: "Ricoh Printing Systems",
		RTL: "Royal Information Electronics",
		SAMP: "Sampo",
		SAMS: "Samsung",
		SANT: "Jaime Santana Pomares",
		SCIT: "Scitex",
		SCRN: "Dainippon Screen",
		SDP: "Scitex",
		SEC: "Samsung",
		SEIK: "Seiko Instruments",
		SEIk: "Seikosha",
		SGUY: "ScanGuy.com",
		SHAR: "Sharp Laboratories",
		SICC: "International Color Consortium",
		SONY: "Sony",
		SPCL: "SpectraCal",
		STAR: "Star",
		STC: "Sampo Technology",
		Scit: "Scitex",
		Sdp: "Scitex",
		Sony: "Sony",
		TALO: "Talon Technology",
		TAND: "Tandy",
		TATU: "Tatung",
		TAXA: "TAXAN America",
		TDS: "Tokyo Denshi Sekei",
		TECO: "TECO Information Systems",
		TEGR: "Tegra",
		TEKT: "Tektronix",
		TI: "Texas Instruments",
		TMKR: "TypeMaker",
		TOSB: "Toshiba",
		TOSH: "Toshiba",
		TOTK: "TOTOKU ELECTRIC",
		TRIU: "Triumph",
		TSBT: "Toshiba",
		TTX: "TTX Computer Products",
		TVM: "TVM Professional Monitor",
		TW: "TW Casper",
		ULSX: "Ulead Systems",
		UNIS: "Unisys",
		UTZF: "Utz Fehlau & Sohn",
		VARI: "Varityper",
		VIEW: "Viewsonic",
		VISL: "Visual communication",
		VIVO: "Vivo Mobile Communication",
		WANG: "Wang",
		WLBR: "Wilbur Imaging",
		WTG2: "Ware To Go",
		WYSE: "WYSE Technology",
		XERX: "Xerox",
		XRIT: "X-Rite",
		ZRAN: "Zoran",
		Zebr: "Zebra Technologies",
		appl: "Apple Computer",
		bICC: "basICColor",
		berg: "bergdesign",
		ceyd: "Integrated Color Solutions",
		clsp: "MacDermid ColorSpan",
		ds: "Dainippon Screen",
		dupn: "DuPont",
		ffei: "FujiFilm Electronic Imaging",
		flux: "FluxData",
		iris: "Scitex",
		kart: "Scitex",
		lcms: "Little CMS",
		lino: "Linotronic",
		none: "none",
		ob4d: "Erdt Systems",
		obic: "Medigraph",
		quby: "Qubyx Sarl",
		scit: "Scitex",
		scrn: "Dainippon Screen",
		sdp: "Scitex",
		siwi: "SIWI GRAFIKA",
		yxym: "YxyMaster"
	}, gt = {
		scnr: "Scanner",
		mntr: "Monitor",
		prtr: "Printer",
		link: "Device Link",
		abst: "Abstract",
		spac: "Color Space Conversion Profile",
		nmcl: "Named Color",
		cenc: "ColorEncodingSpace profile",
		mid: "MultiplexIdentification profile",
		mlnk: "MultiplexLink profile",
		mvis: "MultiplexVisualization profile",
		nkpf: "Nikon Input Device Profile (NON-STANDARD!)"
	};
	d(C, "icc", [
		[4, ce],
		[12, gt],
		[40, Object.assign({}, ce, gt)],
		[48, ce],
		[80, ce],
		[64, {
			0: "Perceptual",
			1: "Relative Colorimetric",
			2: "Saturation",
			3: "Absolute Colorimetric"
		}],
		["tech", {
			amd: "Active Matrix Display",
			crt: "Cathode Ray Tube Display",
			kpcd: "Photo CD",
			pmd: "Passive Matrix Display",
			dcam: "Digital Camera",
			dcpj: "Digital Cinema Projector",
			dmpc: "Digital Motion Picture Camera",
			dsub: "Dye Sublimation Printer",
			epho: "Electrophotographic Printer",
			esta: "Electrostatic Printer",
			flex: "Flexography",
			fprn: "Film Writer",
			fscn: "Film Scanner",
			grav: "Gravure",
			ijet: "Ink Jet Printer",
			imgs: "Photo Image Setter",
			mpfr: "Motion Picture Film Recorder",
			mpfs: "Motion Picture Film Scanner",
			offs: "Offset Lithography",
			pjtv: "Projection Television",
			rpho: "Photographic Paper Printer",
			rscn: "Reflective Scanner",
			silk: "Silkscreen",
			twax: "Thermal Wax Printer",
			vidc: "Video Camera",
			vidm: "Video Monitor"
		}]
	]);
	var ue = class extends b {
		static canHandle(e, t, i) {
			return e.getUint8(t + 1) === 237 && e.getString(t + 4, 9) === "Photoshop" && this.containsIptc8bim(e, t, i) !== void 0;
		}
		static headerLength(e, t, i) {
			let n, r = this.containsIptc8bim(e, t, i);
			if (r !== void 0) return n = e.getUint8(t + r + 7), n % 2 != 0 && (n += 1), n === 0 && (n = 4), r + 8 + n;
		}
		static containsIptc8bim(e, t, i) {
			for (let n = 0; n < i; n++) if (this.isIptcSegmentHead(e, t + n)) return n;
		}
		static isIptcSegmentHead(e, t) {
			return e.getUint8(t) === 56 && e.getUint32(t) === 943868237 && e.getUint16(t + 4) === 1028;
		}
		parse() {
			let { raw: e } = this, t = this.chunk.byteLength - 1, i = !1;
			for (let n = 0; n < t; n++) if (this.chunk.getUint8(n) === 28 && this.chunk.getUint8(n + 1) === 2) {
				i = !0;
				let r = this.chunk.getUint16(n + 3), s = this.chunk.getUint8(n + 2), a = this.chunk.getLatin1String(n + 5, r);
				e.set(s, this.pluralizeValue(e.get(s), a)), n += 4 + r;
			} else if (i) break;
			return this.translate(), this.output;
		}
		pluralizeValue(e, t) {
			return e !== void 0 ? e instanceof Array ? (e.push(t), e) : [e, t] : t;
		}
	};
	l(ue, "type", "iptc"), l(ue, "translateValues", !1), l(ue, "reviveValues", !1), g.set("iptc", ue), d(S, "iptc", [
		[0, "ApplicationRecordVersion"],
		[3, "ObjectTypeReference"],
		[4, "ObjectAttributeReference"],
		[5, "ObjectName"],
		[7, "EditStatus"],
		[8, "EditorialUpdate"],
		[10, "Urgency"],
		[12, "SubjectReference"],
		[15, "Category"],
		[20, "SupplementalCategories"],
		[22, "FixtureIdentifier"],
		[25, "Keywords"],
		[26, "ContentLocationCode"],
		[27, "ContentLocationName"],
		[30, "ReleaseDate"],
		[35, "ReleaseTime"],
		[37, "ExpirationDate"],
		[38, "ExpirationTime"],
		[40, "SpecialInstructions"],
		[42, "ActionAdvised"],
		[45, "ReferenceService"],
		[47, "ReferenceDate"],
		[50, "ReferenceNumber"],
		[55, "DateCreated"],
		[60, "TimeCreated"],
		[62, "DigitalCreationDate"],
		[63, "DigitalCreationTime"],
		[65, "OriginatingProgram"],
		[70, "ProgramVersion"],
		[75, "ObjectCycle"],
		[80, "Byline"],
		[85, "BylineTitle"],
		[90, "City"],
		[92, "Sublocation"],
		[95, "State"],
		[100, "CountryCode"],
		[101, "Country"],
		[103, "OriginalTransmissionReference"],
		[105, "Headline"],
		[110, "Credit"],
		[115, "Source"],
		[116, "CopyrightNotice"],
		[118, "Contact"],
		[120, "Caption"],
		[121, "LocalCaption"],
		[122, "Writer"],
		[125, "RasterizedCaption"],
		[130, "ImageType"],
		[131, "ImageOrientation"],
		[135, "LanguageIdentifier"],
		[150, "AudioType"],
		[151, "AudioSamplingRate"],
		[152, "AudioSamplingResolution"],
		[153, "AudioDuration"],
		[154, "AudioOutcue"],
		[184, "JobID"],
		[185, "MasterDocumentID"],
		[186, "ShortDocumentID"],
		[187, "UniqueDocumentID"],
		[188, "OwnerID"],
		[200, "ObjectPreviewFileFormat"],
		[201, "ObjectPreviewFileVersion"],
		[202, "ObjectPreviewData"],
		[221, "Prefs"],
		[225, "ClassifyState"],
		[228, "SimilarityIndex"],
		[230, "DocumentNotes"],
		[231, "DocumentHistory"],
		[232, "ExifCameraInfo"],
		[255, "CatalogSets"]
	]), d(C, "iptc", [
		[10, {
			0: "0 (reserved)",
			1: "1 (most urgent)",
			2: "2",
			3: "3",
			4: "4",
			5: "5 (normal urgency)",
			6: "6",
			7: "7",
			8: "8 (least urgent)",
			9: "9 (user-defined priority)"
		}],
		[75, {
			a: "Morning",
			b: "Both Morning and Evening",
			p: "Evening"
		}],
		[131, {
			L: "Landscape",
			P: "Portrait",
			S: "Square"
		}]
	]);
	function jt(e) {
		const t = new Array(128).fill(0), i = new Array(128).fill(0), n = new Array(128).fill(0), r = new Array(128).fill(0), s = e.data;
		for (let a = 0; a < s.length; a += 16) {
			const o = s[a], h = s[a + 1], c = s[a + 2];
			t[o >> 1] += 1, i[h >> 1] += 1, n[c >> 1] += 1, r[Math.round(.299 * o + .587 * h + .114 * c) >> 1] += 1;
		}
		return {
			red: t,
			green: i,
			blue: n,
			gray: r
		};
	}
	const j = self;
	function pt(e) {
		if (e instanceof Date) {
			if (Number.isNaN(e.getTime())) return;
			const t = (i) => String(i).padStart(2, "0");
			return `${e.getFullYear()}-${t(e.getMonth() + 1)}-${t(e.getDate())} ${t(e.getHours())}:${t(e.getMinutes())}`;
		}
		if (typeof e == "string" && e.trim()) return e.trim();
	}
	function W(e) {
		return typeof e == "string" && e.trim() ? e.trim() : void 0;
	}
	function Wt(e) {
		if (!e) return;
		const t = [e.Make, e.Model].filter((a) => !!a).join(" ").trim(), i = [e.LensMake, e.LensModel].filter((a) => !!a).join(" ").trim(), n = e.ColorSpace, r = n === 1 || n === "sRGB" ? "sRGB" : n === 65535 || n === 65535 ? "Adobe RGB" : typeof n == "string" && n ? n : void 0, s = {
			camera: t || void 0,
			lens: i || void 0,
			artist: W(e.Artist),
			focalLength: typeof e.FocalLength == "number" ? e.FocalLength : void 0,
			focalLength35: typeof e.FocalLengthIn35mmFormat == "number" ? e.FocalLengthIn35mmFormat : void 0,
			maxAperture: typeof e.MaxApertureValue == "number" ? e.MaxApertureValue : void 0,
			fNumber: typeof e.FNumber == "number" ? e.FNumber : void 0,
			exposureTime: typeof e.ExposureTime == "number" ? e.ExposureTime : void 0,
			iso: typeof e.ISO == "number" ? e.ISO : void 0,
			dateTaken: pt(e.DateTimeOriginal) ?? pt(e.ModifyDate),
			colorSpace: r,
			software: W(e.Software),
			exposureProgram: W(e.ExposureProgram),
			meteringMode: W(e.MeteringMode),
			whiteBalance: W(e.WhiteBalance),
			flash: W(e.Flash),
			latitude: typeof e.latitude == "number" ? e.latitude : void 0,
			longitude: typeof e.longitude == "number" ? e.longitude : void 0
		};
		return Object.values(s).some((a) => a !== void 0) ? s : void 0;
	}
	function Kt(e) {
		const t = 256 / Math.max(e.width, e.height), i = Math.max(1, Math.round(e.width * Math.min(t, 1))), n = Math.max(1, Math.round(e.height * Math.min(t, 1))), r = new OffscreenCanvas(i, n).getContext("2d", { willReadFrequently: !0 });
		if (r) return r.drawImage(e, 0, 0, i, n), jt(r.getImageData(0, 0, i, n));
	}
	const Xt = 6, k = /* @__PURE__ */ new Map();
	let J = null, Le = null;
	function _t(e, t) {
		if (k.delete(e), k.set(e, t), k.size > Xt) {
			const i = k.keys().next().value;
			i !== void 0 && k.delete(i);
		}
	}
	async function Yt(e, t) {
		const i = e.headers.get("Content-Length"), n = i ? Number(i) : 0;
		if (!e.body || !t) return e.blob();
		const r = e.body.getReader(), s = [];
		let a = 0, o = 0;
		for (;;) {
			const { done: h, value: c } = await r.read();
			if (h) break;
			if (!c) continue;
			s.push(c), a += c.length;
			const u = Date.now();
			u - o >= 100 && (o = u, t(a, n));
		}
		return new Blob(s, { type: e.headers.get("Content-Type") ?? "application/octet-stream" });
	}
	async function $t(e, t, i) {
		const n = await fetch(e, {
			mode: "cors",
			signal: t
		});
		if (!n.ok) throw new Error(`Failed to fetch image: ${n.status}`);
		const r = await Yt(n, i);
		let s, a;
		try {
			s = Wt(await Gt.parse(await r.arrayBuffer(), {
				tiff: !0,
				ifd0: {},
				exif: {},
				gps: !0
			}));
		} catch {}
		try {
			const o = await createImageBitmap(r);
			a = Kt(o), o.close();
		} catch {}
		return {
			blob: r,
			exif: s,
			histogram: a,
			fileSize: r.size
		};
	}
	function Ue(e, t, i) {
		const n = k.get(e);
		if (n) return k.delete(e), k.set(e, n), n;
		const r = $t(e, t, i).catch((s) => {
			throw k.delete(e), s;
		});
		return _t(e, r), r;
	}
	j.onmessage = async (e) => {
		const { type: t, payload: i } = e.data;
		if (t === "preload") {
			typeof i?.src == "string" && Ue(i.src).catch(() => {});
			return;
		}
		if (t === "decode-neighbor") {
			const r = i?.requestId;
			if (typeof i?.src != "string" || r === void 0) return;
			(async () => {
				try {
					const s = await Ue(i.src), a = await createImageBitmap(s.blob);
					j.postMessage({
						type: "neighbor",
						payload: {
							bitmap: a,
							requestId: r,
							exif: s.exif,
							histogram: s.histogram,
							fileSize: s.fileSize
						}
					}, [a]);
				} catch {
					j.postMessage({
						type: "neighbor-error",
						payload: { requestId: r }
					});
				}
			})();
			return;
		}
		if (t !== "load") return;
		J && Le !== i.src && J.abort();
		const n = new AbortController();
		J = n, Le = i.src;
		try {
			const r = await Ue(i.src, n.signal, i.silent ? void 0 : (a, o) => {
				j.postMessage({
					type: "progress",
					payload: {
						loaded: a,
						total: o,
						requestId: i.requestId
					}
				});
			}), s = await createImageBitmap(r.blob);
			j.postMessage({
				type: "loaded",
				payload: {
					imageBitmap: s,
					requestId: i.requestId,
					exif: r.exif,
					histogram: r.histogram,
					fileSize: r.fileSize
				}
			}, [s]);
		} catch (r) {
			if (r instanceof Error && r.name === "AbortError") return;
			j.postMessage({
				type: "load-error",
				payload: {
					message: r instanceof Error ? r.message : "Unknown error",
					requestId: i.requestId
				}
			});
		} finally {
			J === n && (J = null, Le = null);
		}
	};
})();
