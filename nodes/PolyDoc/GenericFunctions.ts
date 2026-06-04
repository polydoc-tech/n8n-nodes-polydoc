import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';

export type PolyDocOperation = 'pdf' | 'screenshot' | 'einvoice';
export type PolyDocSourceType = 'url' | 'html' | 'template';
export type PolyDocDeliveryMode = 'download' | 'cloudStorage' | 'webhook';

export interface PolyDocParams {
	operation: PolyDocOperation;
	sourceType: PolyDocSourceType;
	url?: string;
	html?: string;
	templateId?: string;
	templateData?: IDataObject;
	filename?: string;
	tag?: string;
	timeout?: number;
	/** PDF UI options collection: format, landscape, printBackground, scale, pageRanges, outline, tagged, margin* */
	pdfOptions?: IDataObject;
	/** Screenshot UI options: imageType, fullPage, quality, viewportWidth, viewportHeight, devicePixelRatio */
	screenshotOptions?: IDataObject;
	eInvoiceStandard?: 'facturx' | 'zugferd';
	eInvoiceProfile?: string;
	eInvoiceVerify?: boolean;
	invoice?: IDataObject;
	/** Raw object deep-merged into the request body for any field not surfaced as a UI control. */
	advanced?: IDataObject;
	delivery: {
		mode: PolyDocDeliveryMode;
		presignedUrl?: string;
		webhook?: IDataObject;
		binaryPropertyName?: string;
	};
}

export interface PolyDocRequest {
	endpoint: '/pdf/convert' | '/screenshot/convert';
	body: IDataObject;
	isBinary: boolean;
}

function isPlainObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge `source` into `target` (source wins). Arrays and scalars overwrite. */
export function mergeDeep(target: IDataObject, source: IDataObject): IDataObject {
	const out: IDataObject = { ...target };
	for (const [key, value] of Object.entries(source)) {
		if (isPlainObject(value) && isPlainObject(out[key])) {
			out[key] = mergeDeep(out[key] as IDataObject, value);
		} else {
			out[key] = value as IDataObject[string];
		}
	}
	return out;
}

function resolveSource(params: PolyDocParams): string {
	switch (params.sourceType) {
		case 'url':
			return params.url ?? '';
		case 'html':
			return params.html ?? '';
		case 'template':
			return `[template:${params.templateId ?? ''}]`;
		default:
			return '';
	}
}

function buildLayout(opts: IDataObject): IDataObject | undefined {
	const layout: IDataObject = {};
	if (typeof opts.format === 'string' && opts.format !== '') layout.format = opts.format;
	for (const flag of ['landscape', 'printBackground', 'outline', 'tagged'] as const) {
		if (typeof opts[flag] === 'boolean') layout[flag] = opts[flag];
	}
	if (typeof opts.scale === 'number') layout.scale = opts.scale;
	if (typeof opts.pageRanges === 'string' && opts.pageRanges !== '')
		layout.pageRanges = opts.pageRanges;

	const margins = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const;
	if (margins.some((m) => opts[m] !== undefined && opts[m] !== '')) {
		layout.margin = {
			top: opts.marginTop ?? '0',
			right: opts.marginRight ?? '0',
			bottom: opts.marginBottom ?? '0',
			left: opts.marginLeft ?? '0',
		};
	}
	return Object.keys(layout).length > 0 ? layout : undefined;
}

function buildScreenshot(opts: IDataObject): IDataObject | undefined {
	const shot: IDataObject = {};
	if (typeof opts.imageType === 'string' && opts.imageType !== '') shot.type = opts.imageType;
	if (typeof opts.fullPage === 'boolean') shot.fullPage = opts.fullPage;
	if (typeof opts.quality === 'number') shot.quality = opts.quality;
	if (typeof opts.viewportWidth === 'number' && typeof opts.viewportHeight === 'number') {
		const viewport: IDataObject = { width: opts.viewportWidth, height: opts.viewportHeight };
		if (typeof opts.devicePixelRatio === 'number' && opts.devicePixelRatio > 0)
			viewport.devicePixelRatio = opts.devicePixelRatio;
		shot.viewport = viewport;
	}
	return Object.keys(shot).length > 0 ? shot : undefined;
}

/**
 * Assemble the PolyDoc request body from resolved node parameters. Pure and
 * side-effect free so it can be unit-tested without an n8n runtime.
 */
export function buildRequestBody(params: PolyDocParams): PolyDocRequest {
	const endpoint = params.operation === 'screenshot' ? '/screenshot/convert' : '/pdf/convert';
	const body: IDataObject = { source: resolveSource(params) };

	if (params.templateData && Object.keys(params.templateData).length > 0)
		body.templateData = params.templateData;
	if (params.filename) body.filename = params.filename;
	if (params.tag) body.tag = params.tag;
	if (typeof params.timeout === 'number' && params.timeout > 0) body.timeout = params.timeout;

	if (params.operation === 'pdf') {
		const layout = params.pdfOptions ? buildLayout(params.pdfOptions) : undefined;
		if (layout) body.layout = layout;
	}

	if (params.operation === 'screenshot') {
		const shot = params.screenshotOptions ? buildScreenshot(params.screenshotOptions) : undefined;
		if (shot) body.screenshot = shot;
	}

	if (params.operation === 'einvoice') {
		const eInvoice: IDataObject = {
			standard: params.eInvoiceStandard,
			profile: params.eInvoiceProfile,
			invoice: params.invoice ?? {},
		};
		if (typeof params.eInvoiceVerify === 'boolean') eInvoice.verify = params.eInvoiceVerify;
		body.eInvoice = eInvoice;
	}

	const isBinary = params.delivery.mode === 'download';
	if (params.delivery.mode === 'cloudStorage' && params.delivery.presignedUrl) {
		body.cloudStorage = { presignedUrl: params.delivery.presignedUrl };
	}
	if (params.delivery.mode === 'webhook' && params.delivery.webhook) {
		body.webhook = params.delivery.webhook;
	}

	const merged = params.advanced && Object.keys(params.advanced).length > 0
		? mergeDeep(body, params.advanced)
		: body;

	return { endpoint, body: merged, isBinary };
}

/** Default output filename when the user did not set one. */
export function defaultFilename(operation: PolyDocOperation, imageType?: string): string {
	if (operation === 'screenshot') {
		const ext = imageType === 'jpeg' ? 'jpg' : (imageType ?? 'png');
		return `screenshot.${ext}`;
	}
	return 'document.pdf';
}

/**
 * Perform an authenticated PolyDoc API call. Returns the full response so the
 * node can read binary bytes + headers (content-type, conversion id) or parse
 * the JSON delivery confirmation.
 */
export async function polyDocApiRequest(
	this: IExecuteFunctions,
	endpoint: string,
	body: IDataObject,
	isBinary: boolean,
): Promise<{ body: unknown; headers: IDataObject; statusCode: number }> {
	const credentials = await this.getCredentials('polyDocApi');
	const baseUrl = ((credentials.baseUrl as string) || 'https://api.polydoc.tech').replace(
		/\/+$/,
		'',
	);

	const options: IHttpRequestOptions = {
		method: 'POST' as IHttpRequestMethods,
		url: `${baseUrl}${endpoint}`,
		headers: { 'Content-Type': 'application/json' },
		returnFullResponse: true,
	};

	if (isBinary) {
		options.body = JSON.stringify(body);
		options.encoding = 'arraybuffer';
		options.json = false;
	} else {
		options.body = body;
		options.json = true;
	}

	return this.helpers.httpRequestWithAuthentication.call(this, 'polyDocApi', options) as Promise<{
		body: unknown;
		headers: IDataObject;
		statusCode: number;
	}>;
}

/**
 * Best-effort extraction of PolyDoc's `{ error, message }` from a thrown HTTP
 * error, including the binary path where the error body arrives as bytes.
 */
export function extractApiErrorMessage(error: unknown): string | undefined {
	const err = error as { response?: { body?: unknown }; cause?: { error?: unknown } } | undefined;
	let payload: unknown = err?.response?.body;
	if (payload instanceof ArrayBuffer) payload = Buffer.from(payload).toString('utf8');
	if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
	if (typeof payload === 'string') {
		const text = payload;
		try {
			payload = JSON.parse(text);
		} catch {
			return text || undefined;
		}
	}
	if (isPlainObject(payload)) {
		return (payload.message as string) ?? (payload.error as string) ?? undefined;
	}
	return undefined;
}
