import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PolyDocApi implements ICredentialType {
	name = 'polyDocApi';

	displayName = 'PolyDoc API';

	documentationUrl = 'https://docs.polydoc.tech';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your PolyDoc API key. Create one at dashboard.polydoc.tech under API Keys.',
		},
		{
			displayName: 'Sandbox',
			name: 'sandbox',
			type: 'boolean',
			default: false,
			description:
				'Whether to run conversions in sandbox mode (higher quota, watermarked output). Sends the X-Sandbox header.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Validates the key with a tiny sandbox screenshot: 200 for a valid key,
	// 401 for an invalid one. Forced to sandbox so the test never consumes
	// production quota, regardless of the Sandbox toggle.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.polydoc.tech',
			url: '/screenshot/convert',
			method: 'POST',
			headers: {
				'X-Sandbox': 'true',
			},
			body: {
				source: '<p>polydoc</p>',
				screenshot: { type: 'png' },
			},
		},
	};
}
