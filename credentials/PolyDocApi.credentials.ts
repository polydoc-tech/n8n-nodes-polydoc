import type {
	IAuthenticateGeneric,
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
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.polydoc.tech',
			description: 'PolyDoc API base URL. Change only for self-hosted or staging environments.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				'X-Sandbox': '={{$credentials.sandbox ? "true" : "false"}}',
			},
		},
	};
}
