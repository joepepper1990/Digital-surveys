// Fixed names and limits. Lists are addressed by display title; folders by list URL name.
CH.config = {
  VERSION: '1.2.4',
  ENVIRONMENT: 'TEST',
  lists: {
    competencies: { title: 'Competencies', url: 'Competencies' },
    people: { title: 'People', url: 'People' },
    members: { title: 'Competency Members', url: 'CompetencyMembers' },
    actions: { title: 'Actions', url: 'Actions' },
    notices: { title: 'Noticeboard', url: 'Noticeboard' },
    updates: { title: 'Updates', url: 'Updates' },
    calendar: { title: 'Calendar Events', url: 'CalendarEvents' },
    meetings: { title: 'Meetings', url: 'Meetings' },
    requests: { title: 'Requests', url: 'Requests' },
    history: { title: 'History', url: 'History' },
    settings: { title: 'Competency Hub Settings', url: 'Settings' },
    register: { title: 'Improvements and Degradations', url: 'ImprovementRegister' },
    feedback: { title: 'Feedback', url: 'Feedback' },
    meetingItems: { title: 'Meeting Items', url: 'MeetingItems' },
    minutes: { title: 'Meeting Minutes', url: 'MeetingMinutes' }
  },
  pageSize: 500,
  maxRows: 5000,
  dueSoonDays: 7,
  meetingOverdueDays: 35,
  noticeImportantMaxDays: 30,
    // Shorter names for the compact strip of area tiles; the full name shows on hover and in the open panel.
    shortNames: { RP: 'Rad Prot', ALS: 'Active Lab' },
  managementRoles: ['Team Leader', 'Group Head'],
  maxDeadlineYears: 2
};
