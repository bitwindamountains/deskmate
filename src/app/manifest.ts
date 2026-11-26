import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Deskmate', short_name: 'Deskmate', start_url: '/today', display: 'standalone' };
}
