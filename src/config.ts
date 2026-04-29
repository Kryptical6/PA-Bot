export const config = {
  roles: {
    HPA:       '995665374349631590',
    SPA:       '995663941436973086',
    PA:        '995664003323940904',
    gameNight: '000000000000000000', // Role to ping when a game night is announced
  },
  channels: {
    hpaReview:          '1497723043131297914',
    appeals:            '1497723319829401750', // Also used for game suggestion approvals
    logTracker:         '1357749002619322439',
    assessmentResults:  '1357749002619322439',
    gameSuggestions:    '1388953787322077314', // Approved suggestions posted here
    gameNightSchedule:  '1004416752001753149', // Live schedule embed
  },
  escalation: {
    defaultRate: 3,
  },
  expiry: {
    defaultDays: 30,
  },
  reminders: {
    pendingLogDays: 3,
    notifyUserIds: ['1188805446455271426'],
    notifyRoleIds: ['995665374349631590'],
  },
  gameNight: {
    reminderMinutes: [60, 10], // DM RSVPd users 60 min and 10 min before
  },
} as const;