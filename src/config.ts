export const config = {
  roles: {
    HPA: '995665374349631590',
    SPA: '995663941436973086',
    PA:  '995664003323940904',
  },
  channels: {
    hpaReview:         '1497723043131297914',
    appeals:           '1497723319829401750',
    logTracker:        '1357749002619322439',
    assessmentResults: '1345780216488001697',
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
} as const;
