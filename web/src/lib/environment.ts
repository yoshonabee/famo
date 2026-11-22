export const isCloudWeb = import.meta.env.MODE === 'sync'
export const appRefetchInterval = isCloudWeb ? 10_000 : 30_000
export const mobileCloudQuery = '(max-width: 700px)'
