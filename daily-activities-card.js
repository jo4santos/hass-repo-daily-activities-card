import {
    LitElement,
    html,
    css,
    repeat,
} from "https://cdn.jsdelivr.net/gh/lit/dist@2/all/lit-all.min.js";

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
};

class DailyActivitiesCard extends LitElement {
    _currentItem = null;
    _activities = [];

    static getConfigElement() {
        return document.createElement("daily-activities-card-editor");
    }

    static getStubConfig() {
        return {
            category: "Activities",
        };
    }

    static get properties() {
        return {
            _hass: {},
            _config: {},
        };
    }

    setConfig(config) {
        this._config = structuredClone(config);
        this._config.header =
            this._config.header || this._config.category || "Activities";
        this._config.showDueOnly = config.showDueOnly || false;
        this._config.mode = config.mode || "basic";
        this._config.soonHours = config.soonHours || 24;
        this._config.icon = config.icon || "mdi:format-list-checkbox";
        this._config.showHeader = config.showHeader !== false; // Default to true
        this._config.compact = config.compact || false; // Default to false

        this._runOnce = false;
        this._fetchData();
    }

    firstUpdated() {
        (async () => await loadHaForm())();
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._runOnce) {
            // Update when loading
            this._fetchData();

            // Update when changes are made - subscribe to multiple events
            this._hass.connection.subscribeEvents(
                () => this._fetchData(),
                "activity_manager_updated"
            );
            
            // Also listen for state changes
            this._hass.connection.subscribeEvents(
                () => this._fetchData(),
                "state_changed"
            );

            this._runOnce = true;
        }
        
        // Always update data when hass changes (ensures fresh state)
        this._fetchData();
    }

    _getActivityState(activity) {
        if (activity.difference < 0) return "am-overdue";
        if (activity.difference < this._config.soonHours * 60 * 60 * 1000)
            return "am-soon";
        return "am-done";
    }

    render() {
        return html`
            <ha-card class="${this._config.compact ? 'compact' : ''}">
                ${this._config.showHeader ? this._renderHeader() : ''}
                <div class="content">
                    <div class="am-grid">
                        ${repeat(
                            this._activities,
                            (activity) => activity.name,
                            (activity) => html`
                                <div
                                    @click=${() =>
                                        this._showUpdateDialog(activity)}
                                    class="am-item ${this._getActivityState(activity)}"
                                >
                                    <div class="am-icon">
                                        <ha-icon
                                            icon="${activity.icon
                                                ? activity.icon
                                                : "mdi:check-circle-outline"}"
                                        >
                                        </ha-icon>
                                    </div>
                                    <span class="am-item-name">
                                        <div class="am-item-primary">
                                            ${activity.name}
                                        </div>
                                        <div class="am-item-secondary">
                                            ${utils._formatTimeAgo(
                                                activity.due
                                            )}
                                        </div>
                                    </span>
                                    ${this._renderActionButton(activity)}
                                </div>
                            `
                        )}
                    </div>
                </div>
            </ha-card>
            ${this._config.showHeader ? this._renderAddDialog() : ''}
            ${this._renderUpdateDialog()}
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
                    <mwc-icon-button
                        @click=${() => {
                            this.shadowRoot
                                .querySelector(".manage-form")
                                .show();
                        }}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M14.3 21.7C13.6 21.9 12.8 22 12 22C6.5 22 2 17.5 2 12S6.5 2 12 2C13.3 2 14.6 2.3 15.8 2.7L14.2 4.3C13.5 4.1 12.8 4 12 4C7.6 4 4 7.6 4 12S7.6 20 12 20C12.4 20 12.9 20 13.3 19.9C13.5 20.6 13.9 21.2 14.3 21.7M7.9 10.1L6.5 11.5L11 16L21 6L19.6 4.6L11 13.2L7.9 10.1M18 14V17H15V19H18V22H20V19H23V17H20V14H18Z"
                            />
                        </svg>
                    </mwc-icon-button>
                    <mwc-icon-button @click=${this._switchMode}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"
                            />
                        </svg>
                    </mwc-icon-button>
                </div>
            </div>
        `;
    }

    _renderActionButton(activity) {
        return html`
            <div class="am-action">
                ${this._config.mode == "manage"
                    ? html`
                          <mwc-icon-button
                              @click=${(ev) =>
                                  this._showRemoveDialog(ev, activity)}
                              data-am-id=${activity.id}
                          >
                              <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                              >
                                  <path
                                      d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"
                                  />
                              </svg>
                          </mwc-icon-button>
                      `
                    : ``}
            </div>
        `;
    }

    _renderAddDialog() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        let val = `${year}-${month}-${day}T${hours}:${minutes}`;

        return html`
            <ha-dialog class="manage-form" heading="Add Activity for ${this._config["category"]}">
                <form>
                    <div class="am-add-form" >
                        <input
                            type="hidden"
                            id="category"
                            placeholder="Category"
                            value="${this._config["category"]}" />

                        <div class="form-item">
                            <ha-textfield type="text" id="name" placeholder="Name" style="grid-column: 1 / span 2">
                            </ha-textfield>
                        </div>
                        
                        <div class="form-item">
                            <label for="frequency-day">Frequency</label>
                            <div class="duration-input">
                                <ha-textfield type="number" inputmode="numeric" no-spinner label="dd" id="frequency-day" value="0"></ha-textfield>
                                <ha-textfield type="number" inputmode="numeric" no-spinner label="hh" id="frequency-hour" value="0"></ha-textfield>
                                <ha-textfield type="number" inputmode="numeric" no-spinner label="mm" id="frequency-minute" value="0"></ha-textfield>
                                <ha-textfield type="number" inputmode="numeric" no-spinner label="ss"id="frequency-second" value="0"></ha-textfield>
                            </div>
                        </div>

                        <div class="form-item">
                            <label for="icon">Icon</label>
                            <ha-icon-picker type="text" id="icon">
                            </ha-icon-picker>
                        </div>

                        <div class="form-item">
                            <label for="last-completed">Last Completed</label>
                            <ha-textfield type="datetime-local" id="last-completed" value=${val}>
                            </ha-textfield>
                        </div>
                    </div>
                    </ha-form>
                </form>
                <mwc-button slot="primaryAction" dialogAction="discard" @click=${this._addActivity}>
                    Add
                </mwc-button>
                <mwc-button slot="secondaryAction" dialogAction="cancel">
                    Cancel
                </mwc-button>
            </ha-dialog>
        `;
    }

    _renderUpdateDialog() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        let val = `${year}-${month}-${day}T${hours}:${minutes}`;

        return html`
            <ha-dialog class="confirm-update" heading="Confirm">
                <div class="confirm-grid">
                    <div>
                        Yay, you did it! 🎉 If you completed this earlier, feel
                        free to change the date and time below. Great job on
                        completing your activity!
                    </div>
                    <ha-textfield
                        type="datetime-local"
                        id="update-last-completed"
                        label="Activity Last Completed"
                        value=${val}
                    >
                    </ha-textfield>
                </div>
                <mwc-button
                    slot="primaryAction"
                    dialogAction="discard"
                    @click=${this._updateActivity}
                >
                    Update
                </mwc-button>
                <mwc-button slot="secondaryAction" dialogAction="cancel">
                    Cancel
                </mwc-button>
            </ha-dialog>
        `;
    }

    _renderRemoveDialog() {
        return html`
            <ha-dialog class="confirm-remove" heading="Confirm">
                <div>
                    Remove
                    ${this._currentItem ? this._currentItem["name"] : ""}?
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

    _fetchData = async () => {
        const items =
            (await this._hass?.callWS({
                type: "activity_manager/items",
            })) || [];

        this._activities = items
            .map((item) => {
                const completed = new Date(item.last_completed);
                const due = new Date(completed.valueOf() + item.frequency_ms);
                const now = new Date();
                const difference = due - now; // miliseconds

                return {
                    ...item,
                    due: due,
                    difference: difference,
                    time_unit: "day",
                };
            })
            .filter((item) => {
                if ("category" in this._config)
                    return (
                        item["category"] == this._config["category"] ||
                        item["category"] == "Activities"
                    );
                return true;
            })
            .filter((item) => {
                if (this._config.showDueOnly) return item["difference"] < 0;
                return true;
            })
            .sort((a, b) => {
                // Helper function to check if a task name has a prefix
                const hasPrefix = (name) => /^[A-Z]-/.test(name);
                
                const aHasPrefix = hasPrefix(a["name"]);
                const bHasPrefix = hasPrefix(b["name"]);
                
                // If one has prefix and other doesn't, put prefixed ones at bottom
                if (aHasPrefix && !bHasPrefix) return 1;
                if (!aHasPrefix && bHasPrefix) return -1;
                
                // If both have same prefix status, sort by category then name (original logic)
                if (a["category"] == b["category"])
                    return a["name"]
                        .toLowerCase()
                        .localeCompare(b["name"].toLowerCase());
                return a["category"]
                    .toLowerCase()
                    .localeCompare(b["category"].toLowerCase());
            });

        this.requestUpdate();
    };

    _showRemoveDialog(ev, item) {
        ev.stopPropagation();
        this._currentItem = item;
        this.requestUpdate();
        this.shadowRoot.querySelector(".confirm-remove").show();
    }

    _showUpdateDialog(item) {
        this._currentItem = item;
        this.requestUpdate();
        this.shadowRoot.querySelector(".confirm-update").show();
    }

    _updateActivity() {
        if (this._currentItem == null) return;

        let last_completed = this.shadowRoot.querySelector(
            "#update-last-completed"
        );

        this._hass.callWS({
            type: "activity_manager/update",
            item_id: this._currentItem["id"],
            last_completed: last_completed.value,
        });
    }

    _addActivity() {
        let name = this.shadowRoot.querySelector("#name");
        let category = this.shadowRoot.querySelector("#category");
        let icon = this.shadowRoot.querySelector("#icon");
        let last_completed = this.shadowRoot.querySelector("#last-completed");

        let frequency = {};
        frequency.days = utils._getNumber(
            this.shadowRoot.querySelector("#frequency-day").value,
            0
        );
        frequency.hours = utils._getNumber(
            this.shadowRoot.querySelector("#frequency-hour").value,
            0
        );
        frequency.minutes = utils._getNumber(
            this.shadowRoot.querySelector("#frequency-minute").value,
            0
        );
        frequency.seconds = utils._getNumber(
            this.shadowRoot.querySelector("#frequency-second").value,
            0
        );

        this._hass.callService("activity_manager", "add_activity", {
            name: name.value,
            category: category.value,
            frequency: frequency,
            icon: icon.value,
            last_completed: last_completed.value,
        });
        name.value = "";
        icon.value = "";

        let manageEl = this.shadowRoot.querySelector(".manage-form");
        manageEl.close();
    }

    _switchMode() {
        switch (this._config.mode) {
            case "basic":
                this._config.mode = "manage";
                break;
            case "manage":
                this._config.mode = "basic";
                break;
        }
        this.requestUpdate();
    }

    _removeActivity() {
        if (this._currentItem == null) return;

        this._hass.callWS({
            type: "activity_manager/remove",
            item_id: this._currentItem["id"],
        });
    }

    static styles = css`
        /* Daily Activities Card v1.0.1 - Ultra-dense compact mode */
        :host {
            --am-item-primary-font-size: 22px;
            --am-item-secondary-font-size: 13px;
            --mdc-theme-primary: var(--primary-text-color);
        }
        
        /* Compact mode variables - ultra-dense */
        ha-card.compact {
            --am-item-primary-font-size: 13px;
            --am-item-secondary-font-size: 9px;
            --am-content-padding: 4px;
            --am-grid-gap: 3px;
            --am-item-padding: 6px;
            --am-icon-size: 16px;
            --am-icon-container: 20px;
            --am-icon-padding: 2px;
            --am-icon-margin: 6px;
            --am-header-padding: 6px;
        }
        
        /* Default mode variables */
        ha-card:not(.compact) {
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

        .am-item {
            position: relative;
            display: flex;
            border-radius: 12px;
            align-items: center;
            padding: var(--am-item-padding, 12px);
            cursor: pointer;
            border: 2px solid transparent;
        }

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
        }

        .am-item-name {
            flex: 1 1 auto;
            line-height: 1.2;
        }
        
        ha-card.compact .am-item-name {
            line-height: 1.1;
        }

        .am-item-primary {
            font-size: var(--am-item-primary-font-size, 14px);
            font-weight: bold;
        }

        .am-item-secondary {
            font-size: var(--am-item-secondary-font-size, 12px);
            margin-top: 2px;
            opacity: 0.8;
        }
        
        ha-card.compact .am-item-secondary {
            margin-top: 0px;
        }

        .am-action {
            display: grid;
            grid-template-columns: auto auto;
            align-items: center;
        }

        .am-done {
            background-color: #c8e6c9;
            color: #1b5e20;
            border-color: #a5d6a7;
        }

        .am-done .am-icon {
            background-color: #2e7d32;
            color: white;
        }

        .am-soon {
            background-color: #fff8e1;
            color: #e65100;
            border-color: #ffcc02;
        }

        .am-soon .am-icon {
            background-color: #ff9800;
            color: white;
        }

        .am-overdue {
            background-color: #ffebee;
            color: #b71c1c;
            border-color: #ef9a9a;
        }

        .am-overdue .am-icon {
            background-color: #d32f2f;
            color: white;
        }

        .header {
            display: grid;
            grid-template-columns: 52px auto min-content;
            align-items: center;
            padding: var(--am-header-padding, 12px);
        }
        
        .icon-container {
            display: flex;
            height: 40px;
            width: 40px;
            border-radius: 50%;
            background: rgba(111, 111, 111, 0.2);
            place-content: center;
            align-items: center;
            margin-right: 12px;
        }
        
        .info-container {
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        
        .primary {
            font-weight: bold;
        }
        
        .action-container {
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        .am-add-form {
            padding-top: 10px;
            display: grid;
            align-items: center;
            gap: 24px;
        }
        
        .duration-input {
            display: flex;
            flex-direction: row;
            align-items: center;
        }
        
        .form-item {
            display: grid;
            grid-template-columns: 1fr 1.8fr;
            align-items: center;
            --mdc-shape-small: 0px;
        }

        .form-item input::-webkit-outer-spin-button,
        .form-item input::-webkit-inner-spin-button {
            -webkit-appearance: none;
        }

        .confirm-grid {
            display: grid;
            gap: 12px;
        }
    `;
}

class DailyActivitiesCardEditor extends LitElement {
    _categories = [];

    static get properties() {
        return {
            hass: {},
            _config: {},
        };
    }

    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        this._hass = hass;

        Object.keys(this._hass["states"]).forEach((key) => {
            let entity = this._hass["states"][key];
            if ("attributes" in entity) {
                if ("integration" in entity.attributes) {
                    if (entity.attributes.integration == "activity_manager") {
                        if (
                            !this._categories.some(
                                (item) =>
                                    item.label === entity.attributes.category
                            )
                        ) {
                            this._categories.push({
                                label: entity.attributes.category,
                                value: entity.attributes.category,
                            });
                        }
                    }
                }
            }
        });
    }

    _valueChanged(ev) {
        if (!this._config || !this._hass) {
            return;
        }
        const _config = Object.assign({}, this._config);
        _config.category = ev.detail.value.category;
        _config.soonHours = ev.detail.value.soonHours;
        _config.showDueOnly = ev.detail.value.showDueOnly;
        _config.showHeader = ev.detail.value.showHeader;
        _config.compact = ev.detail.value.compact;
        _config.icon = ev.detail.value.icon;
        this._config = _config;

        const event = new CustomEvent("config-changed", {
            detail: { config: _config },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }

    render() {
        if (!this._hass || !this._config) {
            return html``;
        }
        return html`
            <ha-form
                .hass=${this._hass}
                .data=${this._config}
                .schema=${[
                    {
                        name: "category",
                        selector: {
                            select: {
                                options: this._categories,
                                custom_value: true,
                            },
                        },
                    },
                    { name: "icon", selector: { icon: {} } },
                    { name: "showHeader", selector: { boolean: {} } },
                    { name: "compact", selector: { boolean: {} } },
                    { name: "showDueOnly", selector: { boolean: {} } },
                    {
                        name: "soonHours",
                        selector: { number: { unit_of_measurement: "hours" } },
                    },
                ]}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._valueChanged}
            ></ha-form>
        `;
    }

    _computeLabel(schema) {
        var labelMap = {
            category: "Category",
            icon: "Icon",
            showHeader: "Show header",
            compact: "Compact mode",
            showDueOnly: "Only show activities that are due",
            soonHours: "Soon to be due (styles the activity)",
            mode: "Manage mode",
        };
        return labelMap[schema.name];
    }
}

customElements.define("daily-activities-card", DailyActivitiesCard);
customElements.define(
    "daily-activities-card-editor",
    DailyActivitiesCardEditor
);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "daily-activities-card",
    name: "Daily Activities Card",
    preview: true,
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
    ppr.hass = {
        panels: [
            {
                url_path: "tmp",
                component_name: "config",
            },
        ],
    };
    ppr._updateRoutes();
    await ppr.routerOptions.routes.tmp.load();

    await customElements.whenDefined("ha-panel-config");
    const cpr = document.createElement("ha-panel-config");
    await cpr.routerOptions.routes.automation.load();
};