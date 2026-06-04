module.exports = {
	root: true,
	env: { es2022: true, node: true },
	parser: '@typescript-eslint/parser',
	parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
	ignorePatterns: ['dist/**', 'node_modules/**', '*.js', '*.mjs', 'test/**'],
	overrides: [
		{
			files: ['package.json'],
			plugins: ['n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/community'],
			rules: {
				'n8n-nodes-base/community-package-json-name-still-default': 'off',
			},
		},
		{
			files: ['credentials/**/*.ts'],
			plugins: ['n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/credentials'],
			rules: {
				// Contradicts cred-class-field-documentation-url-not-http-url for a full
				// docs URL (it wants a bare camelCase doc id, as core nodes use). We ship
				// a real HTTP URL, which the not-http-url rule requires.
				'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			},
		},
		{
			files: ['nodes/**/*.ts'],
			plugins: ['n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/nodes'],
		},
	],
};
