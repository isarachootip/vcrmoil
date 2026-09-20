export interface LivechatConfig {
  tenantId: string;
  theme?: {
    primaryColor: string;
    position: 'bottom-right' | 'bottom-left';
  };
}

export function initWidget(config: LivechatConfig): void {
  // Skeleton initialization for embeddable livechat widget (<50KB target)
  const root = document.createElement('div');
  root.id = 'vcrm-widget-root';
  root.dataset.tenantId = config.tenantId;
  document.body.appendChild(root);
}
