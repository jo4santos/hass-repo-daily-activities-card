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

            // Update when changes are made
            this._hass.connection.subscribeEvents(
                () => this._fetchData(),
                "activity_manager_updated"
            );

            this._runOnce = true;
        }
    }

    _getActivityState(activity) {
        if (activity.difference < 0) return "am-overdue";
        if (activity.difference < this._config.soonHours * 60 * 60 * 1000)
            return "am-soon";
        return "am-done";
    }

    render() {
        return html`
            <ha-card>
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
            ${this._renderUpdateDialog()}
            ${this._renderRemoveDialog()}
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

    _removeActivity() {
        if (this._currentItem == null) return;

        this._hass.callWS({
            type: "activity_manager/remove",
            item_id: this._currentItem["id"],
        });
    }

    static styles = css`
        :host {
            --am-item-primary-font-size: 20px;
            --am-item-secondary-font-size: 12px;
            --mdc-theme-primary: var(--primary-text-color);
        }
        .content {
            padding: 12px;
        }
        .am-grid {
            display: grid;
            gap: 12px;
        }

        .am-item {
            position: relative;
            display: flex;
            border-radius: 12px;
            align-items: center;
            padding: 16px;
            cursor: pointer;
            border: 2px solid transparent;
        }

        .am-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            padding: 4px;
            margin-right: 16px;
            --mdc-icon-size: 32px;
            min-width: 40px;
            min-height: 40px;
        }

        .am-item-name {
            flex: 1 1 auto;
            line-height: 1.2;
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

        .am-action {
            display: grid;
            grid-template-columns: auto auto;
            align-items: center;
        }

        .am-done {
            background-color: #d4edda;
            color: #155724;
            border-color: #c3e6cb;
        }

        .am-done .am-icon {
            background-color: #28a745;
            color: white;
        }

        .am-soon {
            background-color: #fff3cd;
            color: #856404;
            border-color: #ffeaa7;
        }

        .am-soon .am-icon {
            background-color: #ffc107;
            color: #856404;
        }

        .am-overdue {
            background-color: #f8d7da;
            color: #721c24;
            border-color: #f5c6cb;
        }

        .am-overdue .am-icon {
            background-color: #dc3545;
            color: white;
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