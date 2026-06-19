import {
	NodeApiError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

import {
	buildRequestBody,
	defaultFilename,
	extractApiErrorMessage,
	polyDocApiRequest,
	type PolyDocOperation,
	type PolyDocParams,
	type PolyDocSourceType,
} from './GenericFunctions';

function parseJson(value: unknown): IDataObject | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'object') return value as IDataObject;
	if (typeof value === 'string') {
		const parsed = JSON.parse(value) as unknown;
		return typeof parsed === 'object' && parsed !== null ? (parsed as IDataObject) : undefined;
	}
	return undefined;
}

export class PolyDoc implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PolyDoc',
		name: 'polyDoc',
		icon: 'file:polyDoc.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Convert HTML or URLs to PDF, capture screenshots, and generate EU e-invoices',
		defaults: {
			name: 'PolyDoc',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'polyDocApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'HTML/URL to PDF',
						value: 'pdf',
						action: 'Convert HTML or a URL to PDF',
					},
					{
						name: 'Capture Screenshot',
						value: 'screenshot',
						action: 'Capture a screenshot of HTML or a URL',
					},
					{
						name: 'Generate E-Invoice',
						value: 'einvoice',
						action: 'Generate an electronic invoice',
					},
				],
				default: 'pdf',
			},

			// ─── Source ────────────────────────────────────────────────────────
			{
				displayName: 'Source',
				name: 'sourceType',
				type: 'options',
				options: [
					{ name: 'URL', value: 'url', description: 'Render a web page by URL' },
					{ name: 'HTML', value: 'html', description: 'Render an inline HTML string' },
					{
						name: 'Template',
						value: 'template',
						description: 'Render a saved PolyDoc template by ID',
					},
				],
				default: 'url',
				description: 'Where the document content comes from',
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://example.com',
				required: true,
				displayOptions: { show: { sourceType: ['url'] } },
				description: 'The URL of the page to render',
			},
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				displayOptions: { show: { sourceType: ['html'] } },
				description: 'The inline HTML to render',
			},
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { sourceType: ['template'] } },
				description: 'ID of the saved template (from the PolyDoc dashboard)',
			},
			{
				displayName: 'Template Data (JSON)',
				name: 'templateData',
				type: 'json',
				default: '{}',
				displayOptions: { show: { sourceType: ['template'] } },
				description: 'Data passed to the Liquid template renderer',
			},

			// ─── E-Invoice ─────────────────────────────────────────────────────
			{
				displayName: 'Standard',
				name: 'eInvoiceStandard',
				type: 'options',
				options: [
					{ name: 'ZUGFeRD', value: 'zugferd' },
					{ name: 'Factur-X', value: 'facturx' },
				],
				default: 'zugferd',
				displayOptions: { show: { operation: ['einvoice'] } },
				description: 'The hybrid e-invoice standard to embed',
			},
			{
				displayName: 'Profile',
				name: 'eInvoiceProfile',
				type: 'options',
				options: [
					{ name: 'Basic', value: 'basic' },
					{ name: 'Basic WL', value: 'basicwl' },
					{ name: 'EN 16931', value: 'en16931' },
					{ name: 'Extended', value: 'extended' },
					{ name: 'Minimum', value: 'minimum' },
				],
				default: 'en16931',
				displayOptions: { show: { operation: ['einvoice'] } },
				description: 'The data granularity profile to validate against',
			},
			{
				displayName: 'Invoice Data (JSON)',
				name: 'invoice',
				type: 'json',
				default:
					'{\n  "number": "INV-001",\n  "issueDate": "2026-01-31",\n  "dueDate": "2026-03-02",\n  "currencyCode": "EUR",\n  "seller": {\n    "name": "Your Company GmbH",\n    "address": { "line1": "Main St 1", "city": "Berlin", "postalCode": "10115", "countryCode": "DE" },\n    "taxId": "DE123456789"\n  },\n  "buyer": {\n    "name": "Customer SARL",\n    "address": { "line1": "Rue 2", "city": "Paris", "postalCode": "75001", "countryCode": "FR" }\n  },\n  "lines": [\n    { "description": "Widget", "quantity": 2, "unitPrice": 10, "lineTotal": 20, "vatRate": 19, "vatCategoryCode": "S" }\n  ],\n  "totalNetAmount": 20,\n  "totalTaxAmount": 3.8,\n  "totalGrossAmount": 23.8\n}',
				displayOptions: { show: { operation: ['einvoice'] } },
				description:
					'Structured invoice data: seller, buyer, lines, totals (see docs.polydoc.tech for the full schema)',
			},
			{
				displayName: 'Verify',
				name: 'eInvoiceVerify',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['einvoice'] } },
				description: 'Whether to verify PDF/A and e-invoice compliance (returns an error if it fails)',
			},

			// ─── PDF options ───────────────────────────────────────────────────
			{
				displayName: 'PDF Options',
				name: 'pdfOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['pdf'] } },
				options: [
					{
						displayName: 'Landscape',
						name: 'landscape',
						type: 'boolean',
						default: false,
						description: 'Whether to use landscape orientation',
					},
					{
						displayName: 'Margin Bottom',
						name: 'marginBottom',
						type: 'string',
						default: '',
						placeholder: '10mm',
						description: 'Bottom margin with optional unit',
					},
					{
						displayName: 'Margin Left',
						name: 'marginLeft',
						type: 'string',
						default: '',
						placeholder: '10mm',
						description: 'Left margin with optional unit',
					},
					{
						displayName: 'Margin Right',
						name: 'marginRight',
						type: 'string',
						default: '',
						placeholder: '10mm',
						description: 'Right margin with optional unit',
					},
					{
						displayName: 'Margin Top',
						name: 'marginTop',
						type: 'string',
						default: '',
						placeholder: '10mm',
						description: 'Top margin with optional unit (mm, cm, in, px)',
					},
					{
						displayName: 'Outline (Bookmarks)',
						name: 'outline',
						type: 'boolean',
						default: false,
						description: 'Whether to generate PDF bookmarks from HTML headings',
					},
					{
						displayName: 'Page Format',
						name: 'format',
						type: 'options',
						options: [
							{ name: 'A3', value: 'A3' },
							{ name: 'A4', value: 'A4' },
							{ name: 'A5', value: 'A5' },
							{ name: 'Ledger', value: 'Ledger' },
							{ name: 'Legal', value: 'Legal' },
							{ name: 'Letter', value: 'Letter' },
							{ name: 'Tabloid', value: 'Tabloid' },
						],
						default: 'A4',
						description: 'Paper size for the PDF',
					},
					{
						displayName: 'Page Ranges',
						name: 'pageRanges',
						type: 'string',
						default: '',
						placeholder: '1-5, 8, 11-13',
						description: 'Pages to include, e.g. "1-5, 8"; empty means all pages',
					},
					{
						displayName: 'Print Background',
						name: 'printBackground',
						type: 'boolean',
						default: true,
						description: 'Whether to print background graphics and colors',
					},
					{
						displayName: 'Scale',
						name: 'scale',
						type: 'number',
						typeOptions: { minValue: 0.1, maxValue: 2 },
						default: 1,
						description: 'Render scale (0.1 to 2)',
					},
					{
						displayName: 'Tagged (Accessible)',
						name: 'tagged',
						type: 'boolean',
						default: false,
						description: 'Whether to produce a tagged (accessible) PDF',
					},
				],
			},

			// ─── Screenshot options ────────────────────────────────────────────
			{
				displayName: 'Screenshot Options',
				name: 'screenshotOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['screenshot'] } },
				options: [
					{
						displayName: 'Device Pixel Ratio',
						name: 'devicePixelRatio',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 10 },
						default: 1,
						description: 'Device pixel ratio, e.g. 2 for retina (0 to 10)',
					},
					{
						displayName: 'Full Page',
						name: 'fullPage',
						type: 'boolean',
						default: false,
						description: 'Whether to capture the entire scrollable page',
					},
					{
						displayName: 'Image Type',
						name: 'imageType',
						type: 'options',
						options: [
							{ name: 'JPEG', value: 'jpeg' },
							{ name: 'PNG', value: 'png' },
							{ name: 'WebP', value: 'webp' },
						],
						default: 'png',
						description: 'Output image format',
					},
					{
						displayName: 'Quality',
						name: 'quality',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 100 },
						default: 80,
						description: 'Compression quality for JPEG/WebP (0 to 100)',
					},
					{
						displayName: 'Viewport Height',
						name: 'viewportHeight',
						type: 'number',
						default: 800,
						description: 'Viewport height in CSS pixels',
					},
					{
						displayName: 'Viewport Width',
						name: 'viewportWidth',
						type: 'number',
						default: 1280,
						description: 'Viewport width in CSS pixels',
					},
				],
			},

			// ─── Delivery ──────────────────────────────────────────────────────
			{
				displayName: 'Delivery',
				name: 'deliveryMode',
				type: 'options',
				options: [
					{
						name: 'Download',
						value: 'download',
						description: 'Return the file as binary data on the item',
					},
					{
						name: 'Cloud Storage',
						value: 'cloudStorage',
						description: 'Upload the file to a presigned URL (your S3/GCS/Azure bucket)',
					},
					{
						name: 'Webhook',
						value: 'webhook',
						description: 'Deliver the file to a webhook URL',
					},
				],
				default: 'download',
				description: 'How the generated file is returned',
			},
			{
				displayName: 'Put Output In Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: { show: { deliveryMode: ['download'] } },
				description: 'Name of the binary field to write the file to',
			},
			{
				displayName: 'Presigned URL',
				name: 'presignedUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { deliveryMode: ['cloudStorage'] } },
				description: 'HTTP PUT presigned URL from your storage provider',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { deliveryMode: ['webhook'] } },
				description: 'URL the generated file is delivered to',
			},
			{
				displayName: 'Webhook Options (JSON)',
				name: 'webhookOptions',
				type: 'json',
				default: '{}',
				displayOptions: { show: { deliveryMode: ['webhook'] } },
				description:
					'Extra webhook settings merged with the URL (async, method, headers, retries, retryDelay, timeout)',
			},

			// ─── Shared extras ─────────────────────────────────────────────────
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Filename',
						name: 'filename',
						type: 'string',
						default: '',
						description: 'Output filename',
					},
					{
						displayName: 'Tag',
						name: 'tag',
						type: 'string',
						default: '',
						description: 'Label for logging and analytics (max 30 chars)',
					},
					{
						displayName: 'Timeout (Ms)',
						name: 'timeout',
						type: 'number',
						default: 30000,
						description: 'Conversion timeout in milliseconds',
					},
					{
						displayName: 'Advanced (JSON)',
						name: 'advancedOptions',
						type: 'json',
						default: '{}',
						description: 'Raw fields deep-merged into the request body for any API option not exposed above (e.g. pdf.watermark, pdf.pdfa, pdf.ua, render, request)',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as PolyDocOperation;
				const sourceType = this.getNodeParameter('sourceType', i) as PolyDocSourceType;
				const deliveryMode = this.getNodeParameter('deliveryMode', i, 'download') as
					| 'download'
					| 'cloudStorage'
					| 'webhook';
				const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

				const params: PolyDocParams = {
					operation,
					sourceType,
					filename: (additionalFields.filename as string) || undefined,
					tag: (additionalFields.tag as string) || undefined,
					timeout: additionalFields.timeout as number | undefined,
					advanced: parseJson(additionalFields.advancedOptions),
					delivery: { mode: deliveryMode },
				};

				if (sourceType === 'url') params.url = this.getNodeParameter('url', i) as string;
				else if (sourceType === 'html') params.html = this.getNodeParameter('html', i) as string;
				else {
					params.templateId = this.getNodeParameter('templateId', i) as string;
					params.templateData = parseJson(this.getNodeParameter('templateData', i, '{}'));
				}

				if (operation === 'pdf') {
					params.pdfOptions = this.getNodeParameter('pdfOptions', i, {}) as IDataObject;
				} else if (operation === 'screenshot') {
					params.screenshotOptions = this.getNodeParameter(
						'screenshotOptions',
						i,
						{},
					) as IDataObject;
				} else {
					params.eInvoiceStandard = this.getNodeParameter('eInvoiceStandard', i) as
						| 'facturx'
						| 'zugferd';
					params.eInvoiceProfile = this.getNodeParameter('eInvoiceProfile', i) as string;
					params.eInvoiceVerify = this.getNodeParameter('eInvoiceVerify', i, false) as boolean;
					params.invoice = parseJson(this.getNodeParameter('invoice', i, '{}'));
				}

				if (deliveryMode === 'download') {
					params.delivery.binaryPropertyName = this.getNodeParameter(
						'binaryPropertyName',
						i,
						'data',
					) as string;
				} else if (deliveryMode === 'cloudStorage') {
					params.delivery.presignedUrl = this.getNodeParameter('presignedUrl', i) as string;
				} else {
					const webhookExtra = parseJson(this.getNodeParameter('webhookOptions', i, '{}')) ?? {};
					params.delivery.webhook = {
						url: this.getNodeParameter('webhookUrl', i) as string,
						...webhookExtra,
					};
				}

				const request = buildRequestBody(params);
				const response = await polyDocApiRequest.call(
					this,
					request.endpoint,
					request.body,
					request.isBinary,
				);

				if (request.isBinary) {
					const buffer = Buffer.from(response.body as ArrayBuffer);
					const contentType =
						String((response.headers?.['content-type'] as string) ?? '')
							.split(';')[0]
							.trim() || 'application/octet-stream';
					const imageType = params.screenshotOptions?.imageType as string | undefined;
					const fileName = params.filename || defaultFilename(operation, imageType);
					const binaryPropertyName = params.delivery.binaryPropertyName ?? 'data';
					const binaryData = await this.helpers.prepareBinaryData(buffer, fileName, contentType);

					returnData.push({
						json: {
							success: true,
							contentType,
							sizeBytes: buffer.length,
							conversionId: response.headers?.['x-conversion-id'],
							creditUsed: response.headers?.['x-credit-used'],
						},
						binary: { [binaryPropertyName]: binaryData },
						pairedItem: { item: i },
					});
				} else {
					returnData.push({
						json: (response.body as IDataObject) ?? { success: true },
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				const apiMessage = extractApiErrorMessage(error);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: apiMessage ?? (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeApiError(
					this.getNode(),
					error as JsonObject,
					apiMessage ? { message: apiMessage, itemIndex: i } : { itemIndex: i },
				);
			}
		}

		return [returnData];
	}
}
