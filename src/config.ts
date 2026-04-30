export const config = {
  roles: {
    HPA:       '995665374349631590',
    SPA:       '995663941436973086',
    PA:        '995664003323940904',
    gameNight: '000000000000000000',
  },
  channels: {
    hpaReview:          '1497723043131297914',
    appeals:            '1497723319829401750',
    logTracker:         '1357749002619322439',
    assessmentResults:  '1345780216488001697',
    gameSuggestions:    '1388953787322077314',
    gameNightSchedule:  '1004416752001753149',
    escalations:        '1499180338017206302',
    feedbackResponses:  '1499511320100470885', // Private channel for feedback responses
    suggestions:        '1499511320100470885', // Channel for suggestion review + threads
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
    reminderMinutes: [60, 10],
  },
} as const;
