import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Scholar', short_name: 'Scholar', start_url: '/today', display: 'standalone' };
}
