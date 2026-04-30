import { REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';
dotenv.config();

import { data as help }             from './commands/shared/help';
import { data as myLogs }           from './commands/shared/my_logs';
import { data as appeal }           from './commands/shared/appeal';
import { data as tag }              from './commands/shared/tag';
import { data as tagSearch }        from './commands/shared/tag_search';
import { data as paAssessment }     from './commands/shared/pa_assessment';
import { data as escalate }         from './commands/shared/escalate';
import { data as myEscalations }    from './commands/shared/my_escalations';
import { data as suggestGame }      from './commands/shared/suggest_game';
import { data as viewSuggestions }  from './commands/shared/view_suggestions';

import { data as logMistake }       from './commands/spa/log_mistake';
import { data as staffProfile }     from './commands/spa/staff_profile';
import { data as staffOverview }    from './commands/spa/staff_overview';
import { data as lookupPost }       from './commands/spa/lookup_post';
import { data as warnUser }         from './commands/spa/warn_user';
import { data as createVote }       from './commands/spa/create_vote';
import { data as listAssessments }  from './commands/spa/list_assessments';
import { data as createTag }        from './commands/spa/create_tag';
import { data as editTag }          from './commands/spa/edit_tag';
import { data as deleteTag }        from './commands/spa/delete_tag';
import { data as createEmbed }      from './commands/spa/create_embed';
import { data as editEmbed }        from './commands/spa/edit_embed';
import { data as editGameNight }    from './commands/spa/edit_game_night';
import { data as viewEscalations }  from './commands/spa/view_escalations';

import { data as forceStrike }          from './commands/hpa/force_strike';
import { data as manageLog }            from './commands/hpa/manage_log';
import { data as setEscalation }        from './commands/hpa/set_escalation';
import { data as recalcEscalation }     from './commands/hpa/recalculate_escalation';
import { data as notifyUser }           from './commands/hpa/notify_user';
import { data as bulkActions }          from './commands/hpa/bulk_actions';
import { data as manageLogTracker }     from './commands/hpa/manage_log_tracker';
import { data as createAssessment }     from './commands/hpa/create_assessment';
import { data as createAssessmentQ }    from './commands/hpa/create_assessment_question';
import { data as editAssessmentQ }      from './commands/hpa/edit_assessment_question';
import { data as deleteAssessmentQ }    from './commands/hpa/delete_assessment_question';
import { data as publishAssessment }    from './commands/hpa/publish_assessment';
import { data as restrictAssessment }   from './commands/hpa/restrict_assessment';
import { data as viewResults }          from './commands/hpa/view_assessment_results';
import { data as viewSessions }         from './commands/hpa/view_active_sessions';
import { data as createGameNight }      from './commands/hpa/create_game_night';
import { data as cancelGameNight }      from './commands/hpa/cancel_game_night';
import { data as deleteSuggestion }     from './commands/hpa/delete_suggestion';
import { data as clearStale }           from './commands/hpa/clear_stale';

const commands = [
  // Shared
  help, myLogs, appeal, tag, tagSearch, paAssessment,
  escalate, myEscalations, suggestGame, viewSuggestions,
  // SPA
  logMistake, staffProfile, staffOverview, lookupPost, warnUser, createVote,
  listAssessments, createTag, editTag, deleteTag, createEmbed, editEmbed,
  editGameNight, viewEscalations,
  // HPA
  forceStrike, manageLog, setEscalation, recalcEscalation, notifyUser, bulkActions,
  manageLogTracker, createAssessment, createAssessmentQ, editAssessmentQ,
  deleteAssessmentQ, publishAssessment, restrictAssessment, viewResults,
  viewSessions, createGameNight, cancelGameNight, deleteSuggestion, clearStale,
].map(c => c.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log('Deploying slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, process.env.DISCORD_GUILD_ID!),
      { body: commands }
    );
    console.log(`✅ ${commands.length} commands deployed successfully.`);
  } catch (e) {
    console.error('Deploy failed:', e);
  }
})();
