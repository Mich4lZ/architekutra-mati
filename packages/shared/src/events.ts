export type EventEnvelope<TPayload> = {
  event_id: string;
  event_type: 'click.recorded' | 'report.requested' | 'notification.send';
  version: '1.0';
  timestamp: string;
  payload: TPayload;
};

export type ClickRecordedPayload = {
  link_id: string;
  short_code: string;
  clicked_at: string;
  ip_address: string;
  user_agent: string;
  referrer: string | null;
};

export type ReportRequestedPayload = {
  report_id: string;
  requested_by: string;
  client_id: string | null;
  link_ids: string[];
  date_from: string;
  date_to: string;
  kind: 'manual' | 'weekly';
};

export type NotificationPayload = {
  type: 'report_ready' | 'alert_no_clicks' | 'weekly_report';
  recipient_email: string;
  subject: string;
  template: 'report_ready' | 'alert_no_clicks' | 'weekly_report';
  dedupe_key: string;
  data: {
    report_id: string | null;
    link_id: string | null;
    download_url: string | null;
    campaign_name: string | null;
    short_code: string | null;
    date_from: string | null;
    date_to: string | null;
  };
};

export const EXCHANGE = 'trackflow.events';
export const DEAD_QUEUE = 'trackflow.dead';
