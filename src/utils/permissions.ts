import { GuildMember } from 'discord.js';
import { config } from '../config';

export const isPA  = (m: GuildMember) => m.roles.cache.hasAny(config.roles.PA, config.roles.SPA, config.roles.HPA);
export const isSPA = (m: GuildMember) => m.roles.cache.hasAny(config.roles.SPA, config.roles.HPA);
export const isHPA = (m: GuildMember) => m.roles.cache.has(config.roles.HPA);

export function canLogAgainst(logger: GuildMember, target: GuildMember): boolean {
  if (isHPA(logger)) return target.id !== logger.id;
  if (isSPA(logger)) return !isHPA(target);
  return false;
}
