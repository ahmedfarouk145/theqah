export function buildZidScopes() {
  const scopes = new Set<string>(['orders','webhooks']);
  if (process.env.ENABLE_ZID_SCOPE_EMBEDDED_APPS === 'true') scopes.add('embedded_apps');
  if (process.env.ENABLE_ZID_SCOPE_PRODUCTS === 'true') scopes.add('products');
  return Array.from(scopes).join(' ');
}
