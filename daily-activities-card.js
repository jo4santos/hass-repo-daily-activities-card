import {
    LitElement,
    html,
    css,
    repeat,
} from "https://cdn.jsdelivr.net/gh/lit/dist@2/all/lit-all.min.js";

// Daily Activities Card v2.0.3 - Bubble card style items + popup

export const utils = {
    _formatTimeAgo: (date) => {
        const formatter = new Intl.RelativeTimeFormat(undefined, {
            numeric: "auto",
        });

        const DIVISIONS = [
            { amount: 60, name: "seconds" },
            { amount: 60, name: "minutes" },
            { amount: 24, name: "hours" },
            { amount: 7, name: "days" },
            { amount: 4.34524, name: "weeks" },
            { amount: 12, name: "months" },
            { amount: Number.POSITIVE_INFINITY, name: "years" },
        ];
        let duration = (date - new Date()) / 1000;

        for (let i = 0; i < DIVISIONS.length; i++) {
            const division = DIVISIONS[i];
            if (Math.abs(duration) < division.amount) {
                return formatter.format(Math.round(duration), division.name);
            }
            duration /= division.amount;
        }
    },

    _getNumber: (value, defaultValue) => {
        const num = parseInt(value, 10);
        return isNaN(num) ? defaultValue : num;
    },

    _todayStr: () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    },
};

class DailyActivitiesCard extends LitElement {
    _currentItem = null;
    _activities = [];
    _showAddDialog = false;

    static getConfigElement() {
        return document.createElement("daily-activities-card-editor");
    }

    static getStubConfig() {
        return { entity: "" };
    }

    static get properties() {
        return {
            _hass: {},
            _config: {},
        };
    }

    setConfig(config) {
        if (!config.entity) throw new Error("Please set a todo entity.");

        this._config = structuredClone(config);

        // Display
        this._config.header        = config.header        ?? "Activities";
        this._config.icon          = config.icon          ?? "mdi:format-list-checkbox";
        this._config.showHeader    = config.showHeader    !== false;
        this._config.compact       = config.compact       ?? false;
        this._config.hideBackground= config.hideBackground?? false;

        // Filtering
        this._config.showDueOnly   = config.showDueOnly   ?? false;
        this._config.showCompleted = config.showCompleted ?? true;

        // Item icons
        // iconField: 'none' | 'description'
        // When 'description', parses the description field using descriptionSeparator
        // and takes the part at iconIndex as the mdi icon
        this._config.iconField            = config.iconField            ?? "none";
        this._config.descriptionSeparator = config.descriptionSeparator ?? "|";
        this._config.iconIndex            = config.iconIndex            ?? 0;
        this._config.defaultItemIcon      = config.defaultItemIcon      ?? "mdi:check-circle-outline";

        // Interaction
        this._config.mode = config.mode ?? "basic";

        this._runOnce = false;
        this._fetchData();
    }

    firstUpdated() {
        (async () => await loadHaForm())();
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._runOnce) {
            this._fetchData();

            // Re-fetch when the todo entity state changes (item count changes)
            this._hass.connection.subscribeEvents(
                (event) => {
                    if (event.data?.entity_id === this._config?.entity) {
                        this._fetchData();
                    }
                },
                "state_changed"
            );

            this._runOnce = true;
        }
    }

    // ─── Data ────────────────────────────────────────────────────────────────

    _fetchData = async () => {
        if (!this._hass || !this._config?.entity) return;

        try {
            const wsResult = await this._hass.callWS({
                type: "call_service",
                domain: "todo",
                service: "get_items",
                service_data: { entity_id: this._config.entity },
                return_response: true,
            });

            // HA returns { response: { "entity_id": { items: [...] } } }
            const raw =
                wsResult?.response?.[this._config.entity]?.items ??
                wsResult?.[this._config.entity]?.items ??
                [];

            const todayStr = utils._todayStr();

            this._activities = raw
                .filter((item) => {
                    if (!this._config.showCompleted && item.status === "completed")
                        return false;
                    // showDueOnly: hide future items that have a due date
                    if (this._config.showDueOnly && item.due)
                        return item.due <= todayStr;
                    return true;
                })
                .map((item) => ({
                    ...item,
                    name: item.summary,
                    // Use noon to avoid timezone-shifting the date
                    due: item.due
                        ? (() => {
                              const d = new Date(item.due + "T12:00:00");
                              return d;
                          })()
                        : null,
                    dueDateStr: item.due ?? null,
                    icon: this._getItemIcon(item),
                }))
                .sort((a, b) => {
                    // needs_action before completed
                    if (a.status !== b.status)
                        return a.status === "needs_action" ? -1 : 1;
                    // within same status: overdue first, then no-date, then future
                    if (a.dueDateStr && b.dueDateStr)
                        return a.dueDateStr.localeCompare(b.dueDateStr);
                    if (a.dueDateStr) return -1;
                    if (b.dueDateStr) return 1;
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                });

            this.requestUpdate();
        } catch (e) {
            console.error("daily-activities-card: error fetching todo items", e);
            this._activities = [];
            this.requestUpdate();
        }
    };

    _getItemIcon(item) {
        if (this._config.iconField === "description" && item.description) {
            const parts = item.description.split(this._config.descriptionSeparator);
            const idx   = this._config.iconIndex;
            const part  = parts[idx]?.trim();
            if (part) return part;
        }
        return this._config.defaultItemIcon;
    }

    _getActivityState(activity) {
        if (activity.status === "completed") return "am-done";
        // Overdue or due today → red; future → yellow
        if (activity.dueDateStr) {
            const todayStr = utils._todayStr();
            if (activity.dueDateStr < todayStr)  return "am-overdue";
            if (activity.dueDateStr === todayStr) return "am-soon";
        }
        return "am-overdue"; // needs_action with no due = red
    }

    // ─── Actions ─────────────────────────────────────────────────────────────

    _toggleActivity(activity) {
        const newStatus =
            activity.status === "completed" ? "needs_action" : "completed";
        this._hass.callService("todo", "update_item", {
            entity_id: this._config.entity,
            item: activity.uid ?? activity.summary,
            status: newStatus,
        });
    }

    _openAddDialog() {
        this._showAddDialog = true;
        this.requestUpdate();
    }

    _closeAddDialog() {
        this._showAddDialog = false;
        this.requestUpdate();
    }

    _addActivity() {
        const nameEl    = this.shadowRoot.querySelector("#name");
        const dueDateEl = this.shadowRoot.querySelector("#due-date");

        const name = nameEl?.value?.trim();
        if (!name) return;

        const serviceData = {
            entity_id: this._config.entity,
            item: name,
        };
        if (dueDateEl?.value) serviceData.due_date = dueDateEl.value;

        this._hass.callService("todo", "add_item", serviceData);

        nameEl.value    = "";
        dueDateEl.value = "";
        this._closeAddDialog();
    }

    _showRemoveDialog(ev, item) {
        ev.stopPropagation();
        this._currentItem = item;
        this.requestUpdate();
        this.shadowRoot.querySelector(".confirm-remove").show();
    }

    _removeActivity() {
        if (!this._currentItem) return;
        this._hass.callService("todo", "remove_item", {
            entity_id: this._config.entity,
            item: this._currentItem.uid ?? this._currentItem.summary,
        });
    }

    _switchMode() {
        this._config.mode =
            this._config.mode === "manage" ? "basic" : "manage";
        this.requestUpdate();
    }

    // ─── Render ──────────────────────────────────────────────────────────────

    render() {
        const cardClasses = [
            this._config.compact        ? "compact"       : "",
            this._config.hideBackground ? "no-background" : "",
        ]
            .filter((c) => c)
            .join(" ");

        const grid = html`
            <div class="am-grid">
                ${this._activities.length === 0
                    ? html`<div class="am-empty">No items to show</div>`
                    : repeat(
                          this._activities,
                          (a) => a.uid ?? a.summary,
                          (activity) => html`
                              <div
                                  @click=${() => this._toggleActivity(activity)}
                                  class="am-item ${this._getActivityState(activity)}"
                              >
                                  <div class="am-icon">
                                      <ha-icon icon="${activity.icon}"></ha-icon>
                                  </div>
                                  <span class="am-item-name">
                                      <div class="am-item-primary">
                                          ${activity.name}
                                      </div>
                                      <div class="am-item-secondary">
                                          ${activity.due
                                              ? utils._formatTimeAgo(activity.due)
                                              : ""}
                                      </div>
                                  </span>
                                  ${this._renderActionButton(activity)}
                              </div>
                          `
                      )}
            </div>
        `;

        if (this._config.hideBackground) {
            return html`
                <div class="${cardClasses}">
                    ${this._config.showHeader ? this._renderHeader() : ""}
                    ${grid}
                </div>
                ${this._config.showHeader ? this._renderAddDialog() : ""}
                ${this._renderRemoveDialog()}
            `;
        }

        return html`
            <ha-card class="${cardClasses}">
                ${this._config.showHeader ? this._renderHeader() : ""}
                <div class="content">${grid}</div>
            </ha-card>
            ${this._config.showHeader ? this._renderAddDialog() : ""}
            ${this._renderRemoveDialog()}
        `;
    }

    _renderHeader() {
        return html`
            <div class="header">
                <div class="icon-container">
                    <ha-icon icon="${this._config.icon}"></ha-icon>
                </div>
                <div class="info-container">
                    <div class="primary">${this._config.header}</div>
                </div>
                <div class="action-container">
                    <ha-icon-button
                        .label=${"Add task"}
                        @click=${this._openAddDialog}
                    >
                        <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                    </ha-icon-button>
                    <ha-icon-button .label=${"Manage"} @click=${this._switchMode}>
                        <ha-icon icon="mdi:dots-vertical"></ha-icon>
                    </ha-icon-button>
                </div>
            </div>
        `;
    }

    _renderActionButton(activity) {
        if (this._config.mode !== "manage") return html``;
        return html`
            <div class="am-action">
                <ha-icon-button
                    .label=${"Remove"}
                    @click=${(ev) => this._showRemoveDialog(ev, activity)}
                >
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                </ha-icon-button>
            </div>
        `;
    }

    _renderAddDialog() {
        if (!this._showAddDialog) return html``;
        const todayStr = utils._todayStr();
        return html`
            <div class="am-popup-backdrop" @click=${this._closeAddDialog}>
                <div class="am-popup-card" @click=${(ev) => ev.stopPropagation()}>
                    <div class="am-popup-header">
                        <span class="am-popup-title">Add Task</span>
                        <ha-icon-button .label=${"Close"} @click=${this._closeAddDialog}>
                            <ha-icon icon="mdi:close"></ha-icon>
                        </ha-icon-button>
                    </div>
                    <div class="am-popup-content">
                        <ha-textfield
                            type="text"
                            id="name"
                            label="Task name"
                            style="width: 100%"
                        ></ha-textfield>
                        <ha-textfield
                            type="date"
                            id="due-date"
                            label="Due date (optional)"
                            value="${todayStr}"
                            style="width: 100%"
                        ></ha-textfield>
                    </div>
                    <div class="am-popup-footer">
                        <mwc-button raised @click=${this._addActivity}>Add</mwc-button>
                        <mwc-button @click=${this._closeAddDialog}>Cancel</mwc-button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderRemoveDialog() {
        return html`
            <ha-dialog class="confirm-remove" heading="Remove task">
                <div>
                    Remove
                    <strong>${this._currentItem?.name ?? ""}</strong>?
                </div>
                <mwc-button
                    slot="primaryAction"
                    dialogAction="discard"
                    @click=${this._removeActivity}
                >
                    Remove
                </mwc-button>
                <mwc-button slot="secondaryAction" dialogAction="cancel">
                    Cancel
                </mwc-button>
            </ha-dialog>
        `;
    }

    // ─── Styles ──────────────────────────────────────────────────────────────

    static styles = css`
        /* Daily Activities Card v2.0.3 */
        :host {
            --am-item-primary-font-size: 22px;
            --am-item-secondary-font-size: 13px;
            --mdc-theme-primary: var(--primary-text-color);
        }

        /* No background mode */
        .no-background {
            background: none !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            --am-content-padding: 0px;
        }
        .no-background .am-grid {
            gap: var(--am-grid-gap, 8px);
        }

        /* Compact mode */
        :host ha-card.compact,
        :host .compact {
            --am-item-primary-font-size: 13px;
            --am-item-secondary-font-size: 9px;
            --am-content-padding: 1px;
            --am-grid-gap: 4px;
            --am-item-padding: 0px 8px;
            --am-icon-size: 18px;
            --am-icon-container: 22px;
            --am-icon-padding: 2px;
            --am-icon-margin: 6px;
            --am-header-padding: 4px;
        }
        .compact .am-item-primary  { font-size: 13px !important; }
        .compact .am-item-secondary { font-size: 9px !important; margin-top: 3px !important; }
        .compact .content          { padding: 1px !important; }
        .compact .am-grid          { gap: 4px !important; }
        .compact .am-item          { padding: 0px 8px !important; height: 40px !important; }
        .compact .am-icon,
        .compact .am-done .am-icon,
        .compact .am-soon .am-icon,
        .compact .am-overdue .am-icon {
            width: 22px !important; height: 22px !important;
            min-width: 22px !important; min-height: 22px !important;
            padding: 2px !important; margin-right: 6px !important;
            --mdc-icon-size: 18px !important;
        }
        .compact .am-item-name { line-height: 1.0 !important; }

        /* Default mode */
        :host ha-card:not(.compact),
        :host div:not(.compact) {
            --am-content-padding: 8px;
            --am-grid-gap: 8px;
            --am-item-padding: 12px;
            --am-icon-size: 36px;
            --am-icon-container: 48px;
            --am-icon-padding: 6px;
            --am-icon-margin: 14px;
            --am-header-padding: 12px;
        }

        .content {
            padding: var(--am-content-padding, 8px);
        }
        .am-grid {
            display: grid;
            gap: var(--am-grid-gap, 8px);
        }
        .am-empty {
            padding: 16px;
            text-align: center;
            opacity: 0.5;
            font-size: 14px;
        }
        .am-item {
            position: relative;
            display: flex;
            border-radius: var(--bubble-border-radius, 32px);
            align-items: center;
            padding: var(--am-item-padding, 12px);
            cursor: pointer;
            border: none !important;
            transition: filter 0.1s ease;
        }
        .am-item:active { filter: brightness(0.9); }
        .am-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            padding: var(--am-icon-padding, 6px);
            margin-right: var(--am-icon-margin, 14px);
            --mdc-icon-size: var(--am-icon-size, 36px);
            min-width: var(--am-icon-container, 48px);
            min-height: var(--am-icon-container, 48px);
            flex-shrink: 0;
        }
        .am-item-name {
            flex: 1 1 auto;
            line-height: 1.2;
        }
        :host ha-card.compact .am-item-name,
        :host .compact .am-item-name { line-height: 1.0; }

        .am-item-primary {
            font-size: var(--am-item-primary-font-size, 14px);
            font-weight: bold;
        }
        .am-item-secondary {
            font-size: var(--am-item-secondary-font-size, 12px);
            margin-top: 2px;
            opacity: 0.8;
        }
        :host ha-card.compact .am-item-secondary,
        :host .compact .am-item-secondary { margin-top: -1px; }

        .am-action {
            display: grid;
            grid-template-columns: auto auto;
            align-items: center;
        }

        /* ── State colours ── */
        .am-done { background-color: #c8e6c9; color: #1b5e20; }
        .am-done .am-icon { background-color: #2e7d32; color: white; }

        .am-soon { background-color: #fff8e1; color: #e65100; }
        .am-soon .am-icon { background-color: #ff9800; color: white; }

        .am-overdue { background-color: #ffebee; color: #b71c1c; }
        .am-overdue .am-icon { background-color: #d32f2f; color: white; }

        /* ── Header ── */
        .header {
            display: grid;
            grid-template-columns: 52px auto min-content;
            align-items: center;
            padding: var(--am-header-padding, 12px);
        }
        .icon-container {
            display: flex; height: 40px; width: 40px;
            border-radius: 50%;
            background: rgba(111, 111, 111, 0.2);
            place-content: center; align-items: center;
            margin-right: 12px;
        }
        .info-container { display: flex; flex-direction: column; justify-content: center; }
        .primary { font-weight: bold; }
        .action-container { display: flex; align-items: center; justify-content: center; cursor: pointer; }

        /* ── Bubble card popup ── */
        .am-popup-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            display: flex;
            align-items: flex-end;
            justify-content: center;
        }
        .am-popup-card {
            background: var(--ha-card-background, var(--card-background-color, white));
            border-radius: 28px 28px 0 0;
            padding: 20px 20px 32px;
            width: 100%;
            max-width: 600px;
            box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.3);
        }
        .am-popup-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        }
        .am-popup-title {
            font-size: 18px;
            font-weight: 600;
        }
        .am-popup-content {
            display: grid;
            gap: 12px;
            margin-bottom: 20px;
        }
        .am-popup-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        /* ── Remove dialog ── */
        .confirm-remove strong { font-weight: bold; }
    `;
}

// ─── Editor ──────────────────────────────────────────────────────────────────

class DailyActivitiesCardEditor extends LitElement {
    static get properties() {
        return { hass: {}, _config: {} };
    }

    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        this._hass = hass;
    }

    _valueChanged(ev) {
        if (!this._config || !this._hass) return;
        const _config = { ...this._config, ...ev.detail.value };
        this._config = _config;
        this.dispatchEvent(
            new CustomEvent("config-changed", {
                detail: { config: _config },
                bubbles: true,
                composed: true,
            })
        );
    }

    render() {
        if (!this._hass || !this._config) return html``;
        return html`
            <ha-form
                .hass=${this._hass}
                .data=${this._config}
                .schema=${[
                    {
                        name: "entity",
                        selector: { entity: { domain: "todo" } },
                    },
                    { name: "header",     selector: { text: {} } },
                    { name: "icon",       selector: { icon: {} } },
                    { name: "showHeader", selector: { boolean: {} } },
                    { name: "compact",    selector: { boolean: {} } },
                    { name: "hideBackground", selector: { boolean: {} } },
                    { name: "showDueOnly",    selector: { boolean: {} } },
                    { name: "showCompleted",  selector: { boolean: {} } },
                    { name: "defaultItemIcon", selector: { icon: {} } },
                    {
                        name: "iconField",
                        selector: {
                            select: {
                                options: [
                                    { label: "None (use default icon)", value: "none" },
                                    { label: "From description field",  value: "description" },
                                ],
                            },
                        },
                    },
                    { name: "descriptionSeparator", selector: { text: {} } },
                    {
                        name: "iconIndex",
                        selector: { number: { min: 0, max: 9, mode: "box" } },
                    },
                ]}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._valueChanged}
            ></ha-form>
        `;
    }

    _computeLabel(schema) {
        const map = {
            entity:               "Todo entity",
            header:               "Card header",
            icon:                 "Card icon",
            showHeader:           "Show header",
            compact:              "Compact mode",
            hideBackground:       "Hide card background",
            showDueOnly:          "Show only due / overdue items",
            showCompleted:        "Show completed items",
            defaultItemIcon:      "Default item icon",
            iconField:            "Icon source",
            descriptionSeparator: "Description separator",
            iconIndex:            "Icon position in description (0 = first)",
        };
        return map[schema.name] ?? schema.name;
    }
}

// ─── Registration ─────────────────────────────────────────────────────────────

customElements.define("daily-activities-card",        DailyActivitiesCard);
customElements.define("daily-activities-card-editor", DailyActivitiesCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
    type:    "daily-activities-card",
    name:    "Daily Activities Card",
    preview: true,
    description: "Show and manage tasks from a native HA todo list.",
});

export const loadHaForm = async () => {
    if (
        customElements.get("ha-checkbox") &&
        customElements.get("ha-slider") &&
        customElements.get("ha-combo-box")
    )
        return;

    await customElements.whenDefined("partial-panel-resolver");
    const ppr = document.createElement("partial-panel-resolver");
    ppr.hass = { panels: [{ url_path: "tmp", component_name: "config" }] };
    ppr._updateRoutes();
    await ppr.routerOptions.routes.tmp.load();

    await customElements.whenDefined("ha-panel-config");
    const cpr = document.createElement("ha-panel-config");
    await cpr.routerOptions.routes.automation.load();
};
