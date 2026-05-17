/**
 * Map a skill ID to its tool route. Skill IDs are kebab-case; tool routes
 * follow the convention:
 *
 *   listing-flyer                       -> /listing-flyer
 *   open-house-promo                    -> /open-house-promo
 *   listing-presentation                -> /listing-presentation
 *   social-animator-<template>          -> /social-animator/<template>
 */
export function skillRoute(skillId: string): string {
  const SA_PREFIX = 'social-animator-';
  if (skillId.startsWith(SA_PREFIX)) {
    return `/social-animator/${skillId.slice(SA_PREFIX.length)}`;
  }
  return `/${skillId}`;
}
