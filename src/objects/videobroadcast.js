/**
 * @fileOverview video/broadcast embedded object
 * @license ORB Software. Copyright (c) 2022 Ocean Blue Software Limited
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * HbbTV programming interface: video/broadcast embedded object.
 *
 * Specifiations:
 * HBBTV.
 * <p>
 * Important sections, in brief:
 * HBBTV A.1 (Detailed section-by-section definition for volume 5);
 * OIPF DAE 7.13.1 (The video/broadcast embedded object);
 * OIPF DAE 7.13.3 (Extensions to video/broadcast for access to EIT p/f);
 * OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
 * OIPF DAE 7.13.5 (Extensions to video/broadcast for parental ratings errors);
 * OIPF DAE 7.13.7 (Extensions to video/broadcast for current channel information);
 * HBBTV 8.2.1.1 (Adding and removing stream event listeners);
 * HBBTV 9.7.1 (Synchronization and video objects);
 * HBBTV 10.2.7 (Component selection);
 * HBBTV A.2.1 (Resource management);
 * HBBTV A.2.4 (Extensions to the video/broadcast object);
 * HBBTV A.2.14 (Modifications to clause H.2 "Interaction with the video/broadcast and ...");
 * HBBTV A.2.17 (Notification of change of components).
 *
 * @name VideoBroadcast
 * @class
 * @constructor
 */
hbbtv.objects.VideoBroadcast = (function() {
    const prototype = Object.create(HTMLObjectElement.prototype);
    const privates = new WeakMap();

    const PLAY_STATE_UNREALIZED = 0;
    const PLAY_STATE_CONNECTING = 1;
    const PLAY_STATE_PRESENTING = 2;
    const PLAY_STATE_STOPPED = 3;

    const CHANNEL_STATUS_UNREALIZED = -4;
    const CHANNEL_STATUS_PRESENTING = -3;
    const CHANNEL_STATUS_CONNECTING = -2;
    const CHANNEL_STATUS_CONNECTING_RECOVERY = -1;
    const CHANNEL_STATUS_WRONG_TUNER = 0;
    const CHANNEL_STATUS_NO_SIGNAL = 1;
    const CHANNEL_STATUS_TUNER_IN_USE = 2;
    const CHANNEL_STATUS_PARENTAL_LOCKED = 3;
    const CHANNEL_STATUS_ENCRYPTED = 4;
    const CHANNEL_STATUS_UNKNOWN_CHANNEL = 5;
    const CHANNEL_STATUS_INTERRUPTED = 6;
    const CHANNEL_STATUS_RECORDING_IN_PROGRESS = 7;
    const CHANNEL_STATUS_CANNOT_RESOLVE_URI = 8;
    const CHANNEL_STATUS_INSUFFICIENT_BANDWIDTH = 9;
    const CHANNEL_STATUS_CANNOT_BE_CHANGED = 10;
    const CHANNEL_STATUS_INSUFFICIENT_RESOURCES = 11;
    const CHANNEL_STATUS_CHANNEL_NOT_IN_TS = 12;
    const CHANNEL_STATUS_UNKNOWN_ERROR = 100;

    const COMPONENT_TYPE_ANY = -1;
    const COMPONENT_TYPE_VIDEO = 0;
    const COMPONENT_TYPE_AUDIO = 1;
    const COMPONENT_TYPE_SUBTITLE = 2;

    const ERROR_TUNER_UNAVAILABLE = 2;
    const ERROR_UNKNOWN_CHANNEL = 5;
    const LINKED_APP_SCHEME_1_1 = "urn:dvb:metadata:cs:LinkedApplicationCS:2019:1.1";

    let gActiveStateOwner = null;
    let gBroadbandAvInUse = false;
    const gGarbageCollectionBlocked = new Set();

    const gObjectFinalizedWhileActive = hbbtv.utils.createFinalizationRegistry(() => {
        setVideoRectangle(0, 0, 1280, 720, true, false);
        hbbtv.bridge.broadcast.setPresentationSuspended(gBroadbandAvInUse);
        gActiveStateOwner = null;
    });

    // Constants

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     *
     * @returns {number}
     *
     * @name COMPONENT_TYPE_VIDEO
     * @constant
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'COMPONENT_TYPE_VIDEO', {
        value: COMPONENT_TYPE_VIDEO,
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     *
     * @returns {number}
     *
     * @name COMPONENT_TYPE_AUDIO
     * @constant
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'COMPONENT_TYPE_AUDIO', {
        value: COMPONENT_TYPE_AUDIO,
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     *
     * @returns {number}
     *
     * @name COMPONENT_TYPE_SUBTITLE
     * @constant
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'COMPONENT_TYPE_SUBTITLE', {
        value: COMPONENT_TYPE_SUBTITLE,
    });

    // Properties

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {boolean}
     *
     * @name fullScreen
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'fullScreen', {
        get: function() {
            return privates.get(this).fullScreen;
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {number}
     *
     * @name playState
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'playState', {
        get: function() {
            return privates.get(this).playState;
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {string}
     *
     * @name data
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'data', {
        get: function() {
            return '';
        },
        set: function() {},
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {number}
     *
     * @name height
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'height', {
        get: function() {
            return this.offsetHeight;
        },
        set: function(val) {
            if (this.fullScreen) {
                throw new TypeError('"height" is read-only');
            } else {
                this.style.height = val;
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {number}
     *
     * @name width
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'width', {
        get: function() {
            return this.offsetWidth;
        },
        set: function(val) {
            if (this.fullScreen) {
                throw new TypeError('"width" is read-only');
            } else {
                this.style.width = val;
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onfocus
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onfocus', {
        get() {
            return privates.get(this).onfocusDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onfocusDomLevel0) {
                this.removeEventListener('focus', p.onfocusDomLevel0);
            }
            p.onfocusDomLevel0 = listener;
            if (listener) {
                this.addEventListener('focus', p.onfocusDomLevel0);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onblur
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onblur', {
        get() {
            return privates.get(this).onblurDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onblurDomLevel0) {
                this.removeEventListener('blur', p.onblurDomLevel0);
            }
            p.onblurDomLevel0 = listener;
            if (listener) {
                this.addEventListener('blur', p.onblurDomLevel0);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onFullScreenChange
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onFullScreenChange', {
        get() {
            return privates.get(this).onFullScreenChangeDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onFullScreenChangeDomLevel0) {
                this.removeEventListener('FullScreenChange', p.onFullScreenChangeDomLevel0);
            }
            p.onFullScreenChangeDomLevel0 = listener;
            if (listener) {
                this.addEventListener('FullScreenChange', p.onFullScreenChangeDomLevel0);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onChannelChangeError
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onChannelChangeError', {
        get() {
            return privates.get(this).onChannelChangeErrorDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onChannelChangeErrorDomLevel0) {
                this.removeEventListener('ChannelChangeError', p.onChannelChangeErrorWrapper);
                p.onChannelChangeErrorWrapper = null;
            }
            p.onChannelChangeErrorDomLevel0 = listener;
            if (listener) {
                p.onChannelChangeErrorWrapper = (ev) => {
                    listener(ev.channel, ev.errorState);
                };
                this.addEventListener('ChannelChangeError', p.onChannelChangeErrorWrapper);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onChannelChangeSucceeded
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onChannelChangeSucceeded', {
        get() {
            return privates.get(this).onChannelChangeSucceededDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onChannelChangeSucceededDomLevel0) {
                this.removeEventListener(
                    'ChannelChangeSucceeded',
                    p.onChannelChangeSucceededWrapper
                );
                p.onChannelChangeSucceededWrapper = null;
            }
            p.onChannelChangeSucceededDomLevel0 = listener;
            if (listener) {
                p.onChannelChangeSucceededWrapper = (ev) => {
                    listener(ev.channel);
                };
                this.addEventListener('ChannelChangeSucceeded', p.onChannelChangeSucceededWrapper);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onPlayStateChange
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onPlayStateChange', {
        get() {
            return privates.get(this).onPlayStateChangeDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onPlayStateChangeDomLevel0) {
                this.removeEventListener('PlayStateChange', p.onPlayStateChangeWrapper);
                p.onPlayStateChangeWrapper = null;
            }
            p.onPlayStateChangeDomLevel0 = listener;
            if (listener) {
                p.onPlayStateChangeWrapper = (ev) => {
                    listener(ev.state, ev.error);
                };
                this.addEventListener('PlayStateChange', p.onPlayStateChangeWrapper);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.3 (Extensions to video/broadcast for access to EIT p/f).
     * <p>
     * Security: none.
     *
     * @returns {ProgrammeCollection}
     *
     * @name programmes
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'programmes', {
        get: function() {
            const p = privates.get(this);
            mandatoryBroadcastRelatedSecurityCheck(p);
            if (!p.currentChannelProgrammes) {
                let programmes = hbbtv.bridge.broadcast.getProgrammes(p.currentChannelData.ccid);
                programmes.forEach(function(item, index) {
                    item.parentalRatings = hbbtv.objects.createParentalRatingCollection(
                        item.parentalRatings
                    );
                    programmes[index] = hbbtv.objects.createProgramme(item);
                });
                p.currentChannelProgrammes = programmes;
            }
            return hbbtv.objects.createCollection(p.currentChannelProgrammes);
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.3 (Extensions to video/broadcast for access to EIT p/f).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onProgrammesChanged
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onProgrammesChanged', {
        get() {
            return privates.get(this).onProgrammesChangedDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onProgrammesChangedDomLevel0) {
                this.removeEventListener('ProgrammesChanged', p.onProgrammesChangedDomLevel0);
            }
            p.onProgrammesChangedDomLevel0 = listener;
            if (listener) {
                this.addEventListener('ProgrammesChanged', p.onProgrammesChangedDomLevel0);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onSelectedComponentChanged
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onSelectedComponentChanged', {
        get() {
            return privates.get(this).onSelectedComponentChangedDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onSelectedComponentChangedDomLevel0) {
                this.removeEventListener(
                    'SelectedComponentChanged',
                    p.onSelectedComponentChangedWrapper
                );
                p.onSelectedComponentChangedWrapper = null;
            }
            p.onSelectedComponentChangedDomLevel0 = listener;
            if (listener) {
                p.onSelectedComponentChangedWrapper = (ev) => {
                    listener(ev.componentType);
                };
                this.addEventListener(
                    'SelectedComponentChanged',
                    p.onSelectedComponentChangedWrapper
                );
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onComponentChanged
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onComponentChanged', {
        get() {
            return privates.get(this).onComponentChangedDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onComponentChangedDomLevel0) {
                this.removeEventListener('ComponentChanged', p.onComponentChangedWrapper);
                p.onComponentChangedWrapper = null;
            }
            p.onComponentChangedDomLevel0 = listener;
            if (listener) {
                p.onComponentChangedWrapper = (ev) => {
                    // For COMPONENT_TYPE_ANY (more than 1 component changed) use undefined.
                    let componentType = undefined;
                    if (ev.componentType != COMPONENT_TYPE_ANY) {
                        componentType = ev.componentType;
                    }
                    listener(componentType);
                };
                this.addEventListener('ComponentChanged', p.onComponentChangedWrapper);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.5 (Extensions to video/broadcast for parental ratings errors)
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onParentalRatingChange
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onParentalRatingChange', {
        get() {
            return privates.get(this).onParentalRatingChangeDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onParentalRatingChangeDomLevel0) {
                this.removeEventListener('ParentalRatingChange', p.onParentalRatingChangeWrapper);
                p.onParentalRatingChangeWrapper = null;
            }
            p.onParentalRatingChangeDomLevel0 = listener;
            if (listener) {
                p.onParentalRatingChangeWrapper = (ev) => {
                    listener(ev.contentID, ev.ratings, ev.DRMSystemID, ev.blocked);
                };
                this.addEventListener('ParentalRatingChange', p.onParentalRatingChangeWrapper);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.5 (Extensions to video/broadcast for parental ratings errors)
     * <p>
     * Security: none.
     *
     * @returns {function}
     *
     * @name onParentalRatingError
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'onParentalRatingError', {
        get() {
            return privates.get(this).onParentalRatingErrorDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onParentalRatingErrorDomLevel0) {
                this.removeEventListener('ParentalRatingError', p.onParentalRatingErrorWrapper);
                p.onParentalRatingErrorWrapper = null;
            }
            p.onParentalRatingErrorDomLevel0 = listener;
            if (listener) {
                p.onParentalRatingErrorWrapper = (ev) => {
                    listener(ev.contentID, ev.ratings, ev.DRMSystemID);
                };
                this.addEventListener('ParentalRatingError', p.onParentalRatingErrorWrapper);
            }
        },
    });

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.7 (Extensions to video/broadcast for current channel information).
     * <p>
     * Security: none.
     *
     * @returns {Channel}
     *
     * @name currentChannel
     * @readonly
     * @memberof VideoBroadcast#
     */
    Object.defineProperty(prototype, 'currentChannel', {
        get: function() {
            if (!privates.get(this).isBroadcastRelated) {
                return null;
            }
            return privates.get(this).currentChannelData;
        },
    });

    Object.defineProperty(prototype, 'currentServiceInstance', {
        get: function() {
            const p = privates.get(this);
            if (!p.isBroadcastRelated || isNaN(p.currentInstanceIndex) ||
                    !p.currentChannelData || !p.currentChannelData.serviceInstances) {
                return null;
            }
            return p.currentChannelData.serviceInstances.item(p.currentInstanceIndex);
        },
    });

    Object.defineProperty(prototype, 'onDRMRightsError', {
        get() {
            return privates.get(this).onDRMRightsErrorDomLevel0;
        },
        set(listener) {
            const p = privates.get(this);
            if (p.onDRMRightsErrorDomLevel0) {
                this.removeEventListener('DRMRightsError', p.onDRMRightsErrorWrapper);
                p.onDRMRightsErrorWrapper = null;
            }
            p.onDRMRightsErrorDomLevel0 = listener;
            if (listener) {
                p.onDRMRightsErrorWrapper = (ev) => {
                    listener(ev.errorState, ev.contentID, ev.DRMSystemID, ev.rightsIssuerURL);
                };
                this.addEventListener('DRMRightsError', p.onDRMRightsErrorWrapper);
            }
        },
    });

    // Methods

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: broadcast-related.
     *
     * @returns {ChannelConfig}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.getChannelConfig = function() {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        return p.channelConfig;
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: broadcast-related.
     *
     * @returns {Channel}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.bindToCurrentChannel = function() {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        if (p.playState === PLAY_STATE_UNREALIZED || p.playState === PLAY_STATE_STOPPED) {
            let tmpChannelData;
            let channelData;
            try {
                channelData = hbbtv.bridge.broadcast.getCurrentChannel()
                tmpChannelData = hbbtv.objects.createChannel(
                    channelData
                );
            } catch (e) {
                if (e.name === 'SecurityError') {
                    console.log(
                        'bindToCurrentChannel, unexpected condition: app appears broadcast-independent.'
                    );
                }
                throw e;
            }
            if (tmpChannelData !== false) {
                if (acquireActiveState.call(this)) {
                    console.log('Control DVB presentation!');
                    hbbtv.bridge.broadcast.setPresentationSuspended(false);
                    hbbtv.holePuncher.setBroadcastVideoObject(this);
                    const applicationScheme = hbbtv.bridge.manager.getApplicationScheme();
                    let wasPlayStateStopped = false;
                    if (p.playState === PLAY_STATE_UNREALIZED && applicationScheme === LINKED_APP_SCHEME_1_1) {
                        /* DAE vol5 Table 8 state transition #7 */
                        p.playState = PLAY_STATE_PRESENTING;
                    } else {
                        /* PLAY_STATE_STOPPED */
                        /* DAE vol5 Table 8 state transition #17 with HbbTV 2.0.3 modification */
                        p.playState = PLAY_STATE_CONNECTING;
                        wasPlayStateStopped = applicationScheme === LINKED_APP_SCHEME_1_1;
                    }
                    addBridgeEventListeners.call(this);
                    dispatchPlayStateChangeEvent.call(this, p.playState);
                    if (wasPlayStateStopped) {
                        /* For PLAY_STATE_STOPPED: extra step to go into Presenting State */
                        /* DAE vol5 Table 8 state transition #17 with HbbTV 2.0.3 modification. */
                        p.playState = PLAY_STATE_PRESENTING;
                        dispatchPlayStateChangeEvent.call(this, p.playState);
                    }
                } else {
                    if (p.playState === PLAY_STATE_STOPPED) {
                        /* DAE vol5 Table 8 state transition #17 with HbbTV 2.0.3 modification */
                        dispatchPlayStateChangeEvent.call(this, p.playState);
                    } else {
                        /* DAE vol5 Table 8 state transition #8 - binding fails */
                        unregisterAllStreamEventListeners(p);
                        p.playState = PLAY_STATE_UNREALIZED;
                        dispatchPlayStateChangeEvent.call(
                            this,
                            p.playState,
                            ERROR_TUNER_UNAVAILABLE
                        );
                    }
                }
                p.currentChannelData = tmpChannelData;
                p.currentInstanceIndex = channelData.currentInstanceIndex;
            } else {
                /* DAE vol5 Table 8 state transition #8 - no channel being presented */
                unregisterAllStreamEventListeners(p);
                p.playState = PLAY_STATE_UNREALIZED;
                dispatchPlayStateChangeEvent.call(this, p.playState, ERROR_UNKNOWN_CHANNEL);
            }
        }
        if (p.currentChannelData) {
            return p.currentChannelData;
        }
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @param {number} idType
     * @param {string|number} dsdOrOnid
     * @param {number} sidOrTsid
     * @param {number} sid
     * @param {number} sourceID
     * @param {string} ipBroadcastID
     *
     * @returns {Channel}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.createChannelObject = function(
        idType,
        dsdOrOnid,
        sidOrTsid,
        sid,
        sourceID,
        ipBroadcastID
    ) {
        if (idType == 13) {
            // createChannelObject(idType, dsd, tsid)
            return hbbtv.objects.createChannel({
                idType: idType,
                dsd: dsdOrOnid,
                sid: sidOrTsid,
            });
        } else {
            // createChannelObject(idType, onid, tsid, sid, sourceID, ipBroadcastID)
            let channel = {
                idType: idType,
                onid: dsdOrOnid,
                tsid: sidOrTsid,
                sid: sid,
                sourceID: sourceID,
                ipBroadcastID: ipBroadcastID,
            };
            const p = privates.get(this);
            if (p.isBroadcastRelated) {
                let foundChannel = p.channelConfig ?
                    p.channelConfig.channelList.findChannel(channel) :
                    null;
                if (foundChannel !== null) {
                    return foundChannel;
                }
            }
            return hbbtv.objects.createChannel(channel);
        }
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @param {Channel} channel
     * @param {boolean} trickplay
     * @param {string} contentAccessDescriptorURL
     * @param {number} quiet
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.setChannel = function(
        channel,
        trickplay = false,
        contentAccessDescriptorURL = '',
        quiet = 0
    ) {
        const p = privates.get(this);
        const appScheme = hbbtv.bridge.manager.getApplicationScheme();
        let releaseOnError = false;
        // TODO Check state transitions table. Disallow if not connecting or presenting or stopped.
        if (channel === null) {
            this.release();
            setIsBroadcastRelated.call(this, false);
            const errorState = hbbtv.bridge.broadcast.setChannelToNull(
                trickplay,
                contentAccessDescriptorURL,
                quiet
            );
            if (errorState < 0) {
                dispatchChannelChangeSucceededEvent.call(this, null);
            }
            return;
        }

        // Acquire active state if required
        if (p.playState === PLAY_STATE_UNREALIZED || p.playState === PLAY_STATE_STOPPED) {
            if (!acquireActiveState.call(this)) {
                hbbtv.bridge.broadcast.setPresentationSuspended(false);
                /* DAE vol5 Table 8 state transition #2 & #6 - no suitable tuner is available */
                dispatchChannelChangeErrorEvent.call(this, channel, ERROR_TUNER_UNAVAILABLE);
                return;
            }
            addBridgeEventListeners.call(this);
            releaseOnError = true;
        }
        // Change channel
        p.isTransitioningToBroadcastRelated = true;
        p.quiet = quiet;
        let errorState = 0;
        if (channel.idType == 13) {
            // ID_DVB_SI_DIRECT
            if (channel.dsd !== undefined && channel.sid !== undefined) {
                errorState = hbbtv.bridge.broadcast.setChannelToDsd(
                    hbbtv.utils.base64Encode(channel.dsd),
                    channel.sid,
                    trickplay,
                    contentAccessDescriptorURL,
                    quiet
                );
            }
        } else {
            if (channel.ccid !== undefined) {
                errorState = hbbtv.bridge.broadcast.setChannelToCcid(
                    channel.ccid,
                    trickplay,
                    contentAccessDescriptorURL,
                    quiet
                );
            } else {
                if (
                    channel.onid !== undefined &&
                    channel.tsid !== undefined &&
                    channel.sid !== undefined
                ) {
                    errorState = hbbtv.bridge.broadcast.setChannelToTriplet(
                        channel.idType,
                        channel.onid,
                        channel.tsid,
                        channel.sid,
                        typeof channel.sourceID !== 'undefined' ? channel.sourceID : -1,
                        typeof channel.ipBroadcastID !== 'undefined' ? channel.ipBroadcastID : '',
                        trickplay,
                        contentAccessDescriptorURL,
                        quiet
                    );
                }
            }
        }

        if (errorState >= 0) {
            p.isTransitioningToBroadcastRelated = false;
            if (releaseOnError) {
                removeBridgeEventListeners.call(this);
                hbbtv.holePuncher.setBroadcastVideoObject(null);
                releaseActiveState();
            }
            /* DAE vol5 Table 8 state transition #2 - combination of channel properties is invalid */
            /*                                      - channel type is not supported */
            // TODO Handle permanent errors consistently. Should all permanent errors set the play state to unrealized here,
            // so that it is correct when ChannelChangeErrorEvent is received?
            if (errorState === CHANNEL_STATUS_CHANNEL_NOT_IN_TS) {
                p.playState = PLAY_STATE_UNREALIZED;
                dispatchPlayStateChangeEvent.call(this, p.playState);
            }
            dispatchChannelChangeErrorEvent.call(this, channel, errorState);
            return;
        }

        if (p.isBroadcastRelated && quiet !== 2) {
            try {
                const channelData = hbbtv.bridge.broadcast.getCurrentChannel();
                p.currentChannelData = hbbtv.objects.createChannel(
                    channelData
                );
                p.currentInstanceIndex = channelData.currentInstanceIndex;
                if (p.channelConfig === null) {
                    p.channelConfig = hbbtv.objects.createChannelConfig();
                }
            } catch (e) {
                if (e.name === 'SecurityError') {
                    console.log(
                        'setChannel, unexpected condition: app appears broadcast-independent.'
                    );
                }
                throw e;
            }
        }

        /* DAE vol5 Table 8 state transition #1 */
        unregisterAllStreamEventListeners(p);
        p.playState = PLAY_STATE_CONNECTING;
        p.waitingPlayStateConnectingConfirm = appScheme === LINKED_APP_SCHEME_1_1;
        dispatchPlayStateChangeEvent.call(this, p.playState);
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: broadcast-related.
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.prevChannel = function() {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        cycleChannel.call(this, -1);
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: broadcast-related.
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.nextChannel = function() {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        cycleChannel.call(this, 1);
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @param {boolean} fullScreen
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.setFullScreen = function(val) {
        const p = privates.get(this);
        /** Broadcast-independent applications: setFullScreen() shall have no effect */
        if (!p.isBroadcastRelated) {
            return;
        }
        p.fullScreen = val;
        hbbtv.holePuncher.notifyFullScreenChanged(this);
        dispatchFullScreenChangeEvent.call(this);
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV 10.2.12 Audio level adjustment for audio mixing
     * <p>
     * Security: none.
     *
     * @returns {number} Integer value between 0 up to and including 100 to indicate volume level.
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.getVolume = function() {
        return hbbtv.bridge.broadcast.getVolume();
    }

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV 10.2.12 Audio level adjustment for audio mixing
     * <p>
     * Security: none.
     *
     * @param {number} volume Integer value between 0 up to and including 100 to indicate volume level.
     *
     * @returns {boolean} true if the volume has changed. false if the volume has not changed.
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.setVolume = function(volume) {
        return hbbtv.bridge.broadcast.setVolume(volume);
    }

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @returns {integer}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.release = function() {
        const p = privates.get(this);
        /** Broadcast-independent applications: release() shall have no effect */
        if (!p.isBroadcastRelated) {
            return; // TODO Really?
        }
        removeBridgeEventListeners.call(this);
        if (p.playState !== PLAY_STATE_UNREALIZED) {
            /* DAE vol5 Table 8 state transition #12 */
            p.currentChannelData = null;
            p.currentInstanceIndex = null;
            p.currentNonQuietChannelData = null;
            p.currentChannelProgrammes = null;
            p.currentChannelComponents = null;
            unregisterAllStreamEventListeners(p);
            p.playState = PLAY_STATE_UNREALIZED;
            hbbtv.holePuncher.setBroadcastVideoObject(null);
            releaseActiveState.call(this);
            dispatchPlayStateChangeEvent.call(this, p.playState);
            /* TODO: If app has modified the set of components, they continue to be presented */
        }
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.1 (The video/broadcast embedded object);
     * HBBTV A.2.4 (Extensions to the video/broadcast object).
     * <p>
     * Security: none.
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.stop = function() {
        const p = privates.get(this);
        /** Broadcast-independent applications: stop() shall have no effect */
        if (!p.isBroadcastRelated) {
            return;
        }
        if (p.playState === PLAY_STATE_CONNECTING || p.playState === PLAY_STATE_PRESENTING) {
            /* DAE vol5 Table 8 state transition #14 */
            p.playState = PLAY_STATE_STOPPED;
            hbbtv.bridge.broadcast.setPresentationSuspended(true);
            if (hbbtv.native.name === 'rdk' && hbbtv.native.getProprietary()) {
                // support poorly implemented portals by delaying the event dispatch
                setTimeout(() => {dispatchPlayStateChangeEvent.call(this, p.playState);}, 0);
            }
            else {
                dispatchPlayStateChangeEvent.call(this, p.playState);
            }
        }
    };

    /**
     * Specifications:
     * HBBTV A.2.4.6 (Support for creating audio and video components),
     * <p>
     * Security: none.
     *
     * @param {number} componentType
     *
     * @return {AVComponentCollection}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.createAVAudioComponent = function(
        componentTag,
        language,
        audioDescription,
        audioChannels,
        encoding
    ) {
        const p = privates.get(this);
        if (!p.isBroadcastRelated) {
            return null;
        }
        const component = hbbtv.bridge.broadcast.getPrivateAudioComponent(componentTag);
        if (component !== null) {

            // update the currentChannelComponents with the new component
            if (!p.currentChannelComponents) {
                p.currentChannelComponents = hbbtv.bridge.broadcast.getComponents(
                    p.currentChannelData.ccid,
                    -1
                );
            }
            p.currentChannelComponents.push(component);

            return hbbtv.objects.createAVAudioComponent({
                id: component.id,
                type: COMPONENT_TYPE_AUDIO,
                componentTag: componentTag,
                language: language,
                audioDescription: audioDescription,
                audioChannels: audioChannels,
                encoding: encoding,
            });
        }
        return null;
    };

    /**
     * Specifications:
     * HBBTV A.2.4.6 (Support for creating audio and video components),
     * <p>
     * Security: none.
     *
     * @param {number} componentType
     *
     * @return {AVComponentCollection}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.createAVVideoComponent = function(componentTag, aspectRatio, encoding) {
        const p = privates.get(this);
        if (!p.isBroadcastRelated) {
            return null;
        }
        const component = hbbtv.bridge.broadcast.getPrivateVideoComponent(componentTag);
        if (component !== null) {

            // update the currentChannelComponents with the new component
            if (!p.currentChannelComponents) {
                p.currentChannelComponents = hbbtv.bridge.broadcast.getComponents(
                    p.currentChannelData.ccid,
                    -1
                );
            }
            p.currentChannelComponents.push(component);

            return hbbtv.objects.createAVVideoComponent({
                id: component.id,
                type: COMPONENT_TYPE_VIDEO,
                pid: component.pid,
                encrypted: component.encrypted,
                componentTag: componentTag,
                aspectRatio: aspectRatio,
                encoding: encoding,
            });
        }
        return null;
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     * <p>
     * Security: broadcast-related.
     *
     * @param {number} componentType
     *
     * @return {AVComponentCollection}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.getComponents = function(componentType) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        if (!p.currentChannelComponents) {
            p.currentChannelComponents = hbbtv.bridge.broadcast.getComponents(
                p.currentChannelData.ccid,
                -1
            );
        }
        let result;
        if (componentType === null || componentType === undefined) {
            result = p.currentChannelComponents.filter((component) => {
                return !component.hidden;
            });
        } else {
            result = p.currentChannelComponents.filter((component) => {
                return component.type === componentType && !component.hidden;
            });
        }
        return avComponentArrayToCollection.call(this, result);
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     * <p>
     * Security: broadcast-related.
     *
     * @param {number} componentType
     *
     * @return {AVComponentCollection}
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.getCurrentActiveComponents = function(componentType) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        if (!p.currentChannelComponents) {
            p.currentChannelComponents = hbbtv.bridge.broadcast.getComponents(
                p.currentChannelData.ccid,
                -1
            );
        }
        if (componentType === null || componentType === undefined) {
            let result = p.currentChannelComponents.filter((component) => {
                return component.active;
            });
            return avComponentArrayToCollection.call(this, result);
        } else {
            let result = p.currentChannelComponents.filter((component) => {
                return component.type === componentType && component.active;
            });
            return avComponentArrayToCollection.call(this, result);
        }
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     * <p>
     * Security: broadcast-related.
     *
     * @param {AVComponent|number} component
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.selectComponent = function(component) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        if (!p.currentChannelComponents) {
            p.currentChannelComponents = hbbtv.bridge.broadcast.getComponents(
                p.currentChannelData.ccid,
                -1
            );
        }
        if (!p.currentChannelComponents || p.currentChannelComponents.length === 0) {
            throw new DOMException('', 'InvalidStateError');
        }
        if (isNaN(component)) {
            const componentId = getComponentId(component);
            if (componentId !== null) {
                hbbtv.bridge.broadcast.overrideComponentSelection(component.type, componentId);
            }
        } else {
            // Select the default component
            hbbtv.bridge.broadcast.restoreComponentSelection(component);
        }
    };

    /**
     * Specifications:
     * HBBTV A.1/OIPF DAE 7.13.4 (Extensions to video/broadcast for playback of selected components);
     * HBBTV A.2.17 (Notification of change of components).
     * <p>
     * Security: broadcast-related.
     *
     * @param {AVComponent|number} component
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.unselectComponent = function(component) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        if (isNaN(component)) {
            p.currentChannelComponents = hbbtv.bridge.broadcast.getComponents(
                p.currentChannelData.ccid,
                -1
            );
            const componentId = getComponentId(component);
            const found = p.currentChannelComponents.find((item) => {
                return componentId !== null && componentId === item.id;
            });
            if (found.active) {
                if (
                    component.type == this.COMPONENT_TYPE_AUDIO ||
                    component.type == this.COMPONENT_TYPE_SUBTITLE
                ) {
                    // Select the default component
                    hbbtv.bridge.broadcast.restoreComponentSelection(component.type);
                } else {
                    // Suspend video
                    hbbtv.bridge.broadcast.overrideComponentSelection(component.type, '');
                }
            }
        } else {
            // Suspend this component type
            hbbtv.bridge.broadcast.overrideComponentSelection(component, '');
        }
    };

    /**
     * Specifications:
     * HBBTV 8.2.1 (Acquisition of DSM-CC stream events).
     * <p>
     * Security: none.
     *
     * @param {string} targetURL
     * @param {string} eventName
     * @param {EventListener} listener
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.addStreamEventListener = function(targetURL, eventName, listener) {
        /* Extensions to video/broadcast for synchronization: No security restrictions specified */
        const p = privates.get(this);
        if (p.playState == PLAY_STATE_PRESENTING || p.playState == PLAY_STATE_STOPPED) {
            if (targetURL.startsWith('dsmcc:') || targetURL.endsWith('.xse')) {
                let found = false;
                let componentTag, streamEventId;
                let request = new XMLHttpRequest();
                request.addEventListener('loadend', () => {
                    if (request.status == 200) {
                        let dsmcc_objects =
                            request.responseXML.getElementsByTagName('dsmcc:dsmcc_object');
                        if (dsmcc_objects.length == 0) {
                            dsmcc_objects =
                                request.responseXML.getElementsByTagName('dsmcc_object');
                        }
                        for (let x = 0; x < dsmcc_objects.length && !found; x++) {
                            let stream_events =
                                dsmcc_objects[x].getElementsByTagName('dsmcc:stream_event');
                            if (stream_events.length == 0) {
                                stream_events =
                                    dsmcc_objects[x].getElementsByTagName('stream_event');
                            }
                            for (var y = 0; y < stream_events.length; y++) {
                                let streamEventName =
                                    stream_events[y].getAttribute('dsmcc:stream_event_name');
                                if (streamEventName == null) {
                                    streamEventName =
                                        stream_events[y].getAttribute('stream_event_name');
                                }
                                if (streamEventName === eventName) {
                                    found = true;
                                    componentTag =
                                        dsmcc_objects[x].getAttribute('dsmcc:component_tag');
                                    if (componentTag == null) {
                                        componentTag =
                                            dsmcc_objects[x].getAttribute('component_tag');
                                    }
                                    streamEventId =
                                        stream_events[y].getAttribute('dsmcc:stream_event_id');
                                    if (streamEventId == null) {
                                        streamEventId =
                                            stream_events[y].getAttribute('stream_event_id');
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    if (found) {
                        registerStreamEventListener(
                            p,
                            targetURL,
                            eventName,
                            listener,
                            componentTag,
                            streamEventId
                        );
                    } else {
                        console.error(
                            'Failed to find Stream Event for: ' +
                            targetURL +
                            ', on event:' +
                            eventName +
                            ', request status: ' +
                            request.status
                        );
                        raiseStreamEventError(eventName, listener);
                    }
                });
                request.open('GET', targetURL);
                request.send();
            }
            else {
                registerStreamEventListener(p, targetURL, eventName, listener);
            }
        }
    };

    /**
     * Specifications:
     * HBBTV 8.2.1 (Acquisition of DSM-CC stream events).
     * <p>
     * Security: none.
     *
     * @param {string} targetURL
     * @param {string} eventName
     * @param {EventListener} listener
     *
     * @method
     * @memberof VideoBroadcast#
     */
    prototype.removeStreamEventListener = function(targetURL, eventName, listener) {
        /* Extensions to video/broadcast for synchronization: No security restrictions specified */
        const p = privates.get(this);
        const streamEventID = getStreamEventID(targetURL, eventName);
        const streamEventInternalID = p.streamEventListenerIdMap.get(streamEventID);
        if (streamEventInternalID) {
            const streamEventListeners = p.streamEventListenerMap.get(streamEventInternalID);
            if (streamEventListeners) {
                const index = streamEventListeners.indexOf(listener);
                if (index != -1) {
                    streamEventListeners.splice(index, 1);
                    if (streamEventListeners.length == 0) {
                        p.streamEventListenerIdMap.delete(streamEventID);
                        p.streamEventListenerMap.delete(streamEventInternalID);
                        hbbtv.bridge.broadcast.removeStreamEventListener(streamEventInternalID);
                    }
                }
            } else {
                console.error(
                    'Unconsistent state, ' +
                    streamEventID +
                    '(' +
                    streamEventInternalID +
                    ') has no listeners.'
                );
            }
        } else {
            console.error('Unexisting Stream Event Listener ' + streamEventID);
        }
    };

    prototype.addEventListener = function(type, listener) {
        if (privates.get(this).eventDispatcher.addCountedEventListener(type, listener) > 0) {
            gGarbageCollectionBlocked.add(this);
        }
    };

    prototype.removeEventListener = function(type, listener) {
        if (privates.get(this).eventDispatcher.removeCountedEventListener(type, listener) == 0) {
            gGarbageCollectionBlocked.delete(this);
        }
    };

    // Internal implementation

    function addBridgeEventListeners() {
        const p = privates.get(this);
        if (!p.onChannelStatusChanged) {
            p.onChannelStatusChanged = (event) => {
                const p = privates.get(this);
                console.log(
                    'Received ChannelStatusChanged (' +
                    event.onetId +
                    ',' +
                    event.transId +
                    ',' +
                    event.servId +
                    '), status: ' +
                    event.statusCode +
                    ' playState: ' +
                    p.playState
                );
                if (p.playState == PLAY_STATE_CONNECTING) {
                    switch (event.statusCode) {
                        case CHANNEL_STATUS_PRESENTING:
                            /* DAE vol5 Table 8 state transition #9 */
                            hbbtv.holePuncher.setBroadcastVideoObject(this);
                            p.playState = PLAY_STATE_PRESENTING;
                            dispatchChannelChangeSucceededEvent.call(this, p.currentChannelData);
                            dispatchPlayStateChangeEvent.call(this, p.playState);
                            break;

                        case CHANNEL_STATUS_CONNECTING:
                            if (
                                p.currentChannelData == null ||
                                event.servId != p.currentChannelData.sid ||
                                event.onetId != p.currentChannelData.onid ||
                                event.transId != p.currentChannelData.tsid
                            ) {
                                try {
                                    const channelData = hbbtv.bridge.broadcast.getCurrentChannelForEvent();
                                    p.currentChannelData = hbbtv.objects.createChannel(
                                        channelData
                                    );
                                    p.currentInstanceIndex = channelData.currentInstanceIndex;
                                    if (p.quiet !== 2) {
                                        p.currentNonQuietChannelData = p.currentChannelData;
                                    }
                                } catch (e) {
                                    if (e.name === 'SecurityError') {
                                        console.log(
                                            'Unexpected condition: app appears broadcast-independent.'
                                        );
                                    }
                                    throw e;
                                }
                            }
                            if (p.waitingPlayStateConnectingConfirm) {
                                console.log('waitingPlayStateConnectingConfirm TRUE. Ignore event');
                            } else {
                                /* DAE vol5 Table 8 state transition #10, or possibly, a user initiated channel change */
                                /* Terminal connected to the broadcast or IP multicast stream but presentation blocked */
                                p.playState = PLAY_STATE_CONNECTING;
                                dispatchChannelChangeSucceededEvent.call(
                                    this,
                                    p.currentChannelData
                                );
                                dispatchPlayStateChangeEvent.call(this, p.playState);
                            }
                            break;

                        case CHANNEL_STATUS_CONNECTING_RECOVERY:
                            /* DAE vol5 Table 8 state transition #11 */
                            /* Recovery from transient error */
                            p.playState = PLAY_STATE_PRESENTING;
                            dispatchPlayStateChangeEvent.call(this, p.playState);
                            break;

                        default:
                            if (event.permanentError) {
                                /* DAE vol5 Table 8 state transition #13 */
                                unregisterAllStreamEventListeners(p);
                                p.playState = PLAY_STATE_UNREALIZED;
                                dispatchPlayStateChangeEvent.call(this, p.playState);
                            } /* else DAE vol5 Table 8 state transition #2 */
                            dispatchChannelChangeErrorEvent.call(
                                this,
                                p.currentChannelData,
                                event.statusCode
                            );
                    }
                    p.waitingPlayStateConnectingConfirm = false;
                } else if (p.playState == PLAY_STATE_PRESENTING) {
                    if (event.permanentError) {
                        /* DAE vol5 Table 8 state transition #16A */
                        unregisterAllStreamEventListeners(p);
                        p.playState = PLAY_STATE_UNREALIZED;
                        dispatchPlayStateChangeEvent.call(this, p.playState);
                    } else if (event.statusCode == CHANNEL_STATUS_CONNECTING) {
                        /* Possibly a user initiated channel change (with app not bound to service) */
                        p.playState = PLAY_STATE_CONNECTING;
                        if (
                            p.currentChannelData == null ||
                            event.servId != p.currentChannelData.sid ||
                            event.onetId != p.currentChannelData.onid ||
                            event.transId != p.currentChannelData.tsid
                        ) {
                            try {
                                const channelData = hbbtv.bridge.broadcast.getCurrentChannelForEvent();
                                p.currentNonQuietChannelData = p.currentChannelData = hbbtv.objects.createChannel(
                                    channelData
                                );
                                p.currentInstanceIndex = channelData.currentInstanceIndex;
                            } catch (e) {
                                if (e.name === 'SecurityError') {
                                    console.log(
                                        'onChannelStatusChanged, unexpected condition: app appears broadcast-independent.'
                                    );
                                }
                                throw e;
                            }
                            dispatchChannelChangeSucceededEvent.call(this, p.currentChannelData);
                        }
                        dispatchPlayStateChangeEvent.call(this, p.playState);
                    } /* temporary error */
                    else {
                        /* DAE vol5 Table 8 state transition #15 */
                        p.playState = PLAY_STATE_CONNECTING;
                        dispatchPlayStateChangeEvent.call(this, p.playState);
                    }
                } else if (p.playState == PLAY_STATE_STOPPED && event.permanentError) {
                    /* DAE vol5 Table 8 state transition #16B */
                    unregisterAllStreamEventListeners(p);
                    p.playState = PLAY_STATE_UNREALIZED;
                    dispatchPlayStateChangeEvent.call(this, p.playState);
                } else if (p.playState == PLAY_STATE_STOPPED) {
                    // The VBO is stopped and the channel is changed externally (e.g., ch+)
                    if (event.statusCode == CHANNEL_STATUS_CONNECTING) {
                        if (
                            p.currentChannelData != null &&
                            (event.servId != p.currentChannelData.sid ||
                                event.onetId != p.currentChannelData.onid ||
                                event.transId != p.currentChannelData.tsid)
                        ) {
                            try {
                                const channelData = hbbtv.bridge.broadcast.getCurrentChannelForEvent();
                                p.currentChannelData = hbbtv.objects.createChannel(
                                    channelData
                                );
                                p.currentInstanceIndex = channelData.currentInstanceIndex;
                                p.playState = PLAY_STATE_CONNECTING;
                                dispatchChannelChangeSucceededEvent.call(
                                    this,
                                    p.currentChannelData
                                );
                                dispatchPlayStateChangeEvent.call(this, p.playState);
                            } catch (e) {
                                // Ignored
                            }
                        }
                    }
                } else {
                    console.log(
                        'Unhandled state transition. Current playState ' + p.playState + ', event:'
                    );
                    console.log(event);
                }
            };

            if (!p.onServiceInstanceChanged) {
                p.onServiceInstanceChanged = (event) => {
                    console.log('Received onServiceInstanceChanged');
                    console.log(event);
                    privates.currentInstanceIndex = event.serviceInstanceIndex;
                };
            }

            hbbtv.bridge.addWeakEventListener('ChannelStatusChanged', p.onChannelStatusChanged);
            hbbtv.bridge.addWeakEventListener('ServiceInstanceChanged', p.onServiceInstanceChanged);
        }

        if (!p.onProgrammesChanged) {
            p.onProgrammesChanged = (event) => {
                console.log('Received ProgrammesChanged');
                console.log(event);
                dispatchProgrammesChanged.call(this);
            };

            hbbtv.bridge.addWeakEventListener('ProgrammesChanged', p.onProgrammesChanged);
        }

        if (!p.onParentalRatingChange) {
            p.onParentalRatingChange = (event) => {
                console.log('Received ParentalRatingChange');
                console.log(event);
                if (event.blocked && p.waitingPlayStateConnectingConfirm) {
                    p.playState = PLAY_STATE_CONNECTING;
                    dispatchChannelChangeSucceededEvent.call(
                        this,
                        p.currentChannelData
                    );
                    dispatchPlayStateChangeEvent.call(this, p.playState);
                }
                dispatchParentalRatingChange.call(
                    this,
                    event.contentID,
                    event.ratings,
                    event.DRMSystemID,
                    event.blocked
                );
            };

            hbbtv.bridge.addWeakEventListener('ParentalRatingChange', p.onParentalRatingChange);
        }

        if (!p.onParentalRatingError) {
            p.onParentalRatingError = (event) => {
                console.log('Received ParentalRatingError');
                console.log(event);

                dispatchParentalRatingError.call(
                    this,
                    event.contentID,
                    hbbtv.objects.createCollection(event.ratings),
                    event.DRMSystemID
                );
            };

            hbbtv.bridge.addWeakEventListener('ParentalRatingError', p.onParentalRatingError);
        }

        if (!p.onSelectedComponentChanged) {
            p.onSelectedComponentChanged = (event) => {
                const p = privates.get(this);
                try {
                    p.currentChannelComponents = null;
                    dispatchSelectedComponentChanged.call(this, event.componentType);
                } catch (e) {
                    if (e.name === 'SecurityError') {
                        console.log(
                            'onSelectedComponentChanged, unexpected condition: app appears broadcast-independent.'
                        );
                    }
                    throw e;
                }
            };

            hbbtv.bridge.addWeakEventListener(
                'SelectedComponentChanged',
                p.onSelectedComponentChanged
            );
        }

        if (!p.onComponentChanged) {
            p.onComponentChanged = (event) => {
                const p = privates.get(this);
                /* Update internal state */
                try {
                    p.currentChannelComponents = null;
                    // For COMPONENT_TYPE_ANY (more than 1 component changed) use undefined.
                    let componentType = undefined;
                    if (event.componentType != COMPONENT_TYPE_ANY) {
                        componentType = event.componentType;
                    }
                    dispatchComponentChanged.call(this, componentType);
                } catch (e) {
                    if (e.name === 'SecurityError') {
                        console.log(
                            'onComponentChanged, unexpected condition: app appears broadcast-independent.'
                        );
                    }
                    throw e;
                }
            };

            hbbtv.bridge.addWeakEventListener('ComponentChanged', p.onComponentChanged);
        }

        if (!p.onStreamEvent) {
            p.onStreamEvent = (event) => {
                console.log('Received StreamEvent');
                console.log(JSON.stringify(event));
                dispatchStreamEvent.call(
                    this,
                    event.id,
                    event.name,
                    event.data,
                    event.text,
                    event.status,
                    event.DASHEvent
                );
            };

            hbbtv.bridge.addWeakEventListener('StreamEvent', p.onStreamEvent);
        }

        if (!p.onTransitionedToBroadcastRelated) {
            p.onTransitionedToBroadcastRelated = (event) => {
                const p = privates.get(this);
                if (p.isTransitioningToBroadcastRelated) {
                    p.isTransitioningToBroadcastRelated = false;
                    setIsBroadcastRelated.call(this, true);
                    try {
                        const channelData = hbbtv.bridge.broadcast.getCurrentChannel();
                        p.currentNonQuietChannelData = p.currentChannelData = hbbtv.objects.createChannel(
                            channelData
                        );
                        p.currentInstanceIndex = channelData.currentInstanceIndex;
                        if (p.channelConfig === null) {
                            p.channelConfig = hbbtv.objects.createChannelConfig();
                        }
                    } catch (e) {
                        if (e.name === 'SecurityError') {
                            console.log(
                                'onTransitionedToBroadcastRelated, unexpected condition: app appears broadcast-independent.'
                            );
                        }
                        throw e;
                    }
                }
            };
        }

        hbbtv.bridge.addWeakEventListener(
            'TransitionedToBroadcastRelated',
            p.onTransitionedToBroadcastRelated
        );

        if (!p.onApplicationSchemeUpdated) {
            p.onApplicationSchemeUpdated = (event) => {
                if (event.scheme !== LINKED_APP_SCHEME_1_1) {
                    dispatchChannelChangeSucceededEvent.call(this, p.currentChannelData);
                }
            }

            hbbtv.bridge.addWeakEventListener(
                "ApplicationSchemeUpdated",
                p.onApplicationSchemeUpdated
            );
        }
    }

    function removeBridgeEventListeners() {
        const p = privates.get(this);
        if (p.onChannelStatusChanged != null) {
            hbbtv.bridge.removeWeakEventListener('ChannelStatusChanged', p.onChannelStatusChanged);
            p.onChannelStatusChanged = null;
        }
        if (p.onServiceInstanceChanged != null) {
            hbbtv.bridge.removeWeakEventListener('ServiceInstanceChanged', p.onServiceInstanceChanged);
            p.onServiceInstanceChanged = null;
        }
        if (p.onProgrammesChanged != null) {
            hbbtv.bridge.removeWeakEventListener('ProgrammesChanged', p.onProgrammesChanged);
            p.onProgrammesChanged = null;
        }
        if (p.onParentalRatingChange != null) {
            hbbtv.bridge.removeWeakEventListener('ParentalRatingChange', p.onParentalRatingChange);
            p.onParentalRatingChange = null;
        }
        if (p.onParentalRatingError != null) {
            hbbtv.bridge.removeWeakEventListener('ParentalRatingError', p.onParentalRatingError);
            p.onParentalRatingError = null;
        }
        if (p.onSelectedComponentChanged != null) {
            hbbtv.bridge.removeWeakEventListener(
                'SelectedComponentChanged',
                p.onSelectedComponentChanged
            );
            p.onSelectedComponentChanged = null;
        }
        if (p.onComponentChanged != null) {
            hbbtv.bridge.removeWeakEventListener('ComponentChanged', p.onComponentChanged);
            p.onComponentChanged = null;
        }
        if (p.onStreamEvent != null) {
            hbbtv.bridge.removeWeakEventListener('StreamEvent', p.onStreamEvent);
            p.onStreamEvent = null;
        }
        if (p.onTransitionedToBroadcastRelated != null) {
            hbbtv.bridge.removeWeakEventListener(
                'TransitionedToBroadcastRelated',
                p.onTransitionedToBroadcastRelated
            );
            p.onTransitionedToBroadcastRelated = null;
        }
        if (p.onDRMRightsError != null) {
            hbbtv.bridge.removeWeakEventListener('DRMRightsError', p.onDRMRightsError);
            p.onDRMRightsError = null;
        }
        if (p.onApplicationSchemeUpdated != null) {
            hbbtv.bridge.removeWeakEventListener('ApplicationSchemeUpdated', p.onApplicationSchemeUpdated);
            p.onApplicationSchemeUpdated = null;
        }
    }

    function cycleChannel(delta) {
        const p = privates.get(this);
        if (!p.isBroadcastRelated) {
            throw new DOMException('', 'SecurityError');
        }
        if (p.playState === PLAY_STATE_UNREALIZED || p.channelConfig.channelList.length < 2) {
            dispatchChannelChangeErrorEvent.call(
                this,
                p.currentNonQuietChannelData,
                CHANNEL_STATUS_CANNOT_BE_CHANGED
            );
            return;
        }
        let i;
        for (i = 0; i < p.channelConfig.channelList.length; i++) {
            if (p.channelConfig.channelList.item(i).ccid === p.currentNonQuietChannelData.ccid) {
                /* DAE vol5 Table 8 state transition #3 happens in setChannel() */
                let n = p.channelConfig.channelList.length;
                this.setChannel(p.channelConfig.channelList.item((i + delta + n) % n));
                return;
            }
        }
        if (p.playState === PLAY_STATE_CONNECTING) {
            /* DAE vol5 Table 8 state transition #4 */
            unregisterAllStreamEventListeners(p);
            p.playState = PLAY_STATE_UNREALIZED;
            /* Note: playState is updated first, so it is already correct for the ChannelChangeErrorEvent */
            dispatchChannelChangeErrorEvent.call(
                this,
                p.currentNonQuietChannelData,
                CHANNEL_STATUS_CANNOT_BE_CHANGED
            );
            dispatchPlayStateChangeEvent.call(this, p.playState, CHANNEL_STATUS_CANNOT_BE_CHANGED);
        } else {
            /* Either Presenting or Stopped */
            /* DAE vol5 Table 8 state transition #5 */
            dispatchChannelChangeErrorEvent.call(
                this,
                p.currentNonQuietChannelData,
                CHANNEL_STATUS_CANNOT_BE_CHANGED
            );
        }
    }

    /** Broadcast-independent applications: shall throw a "Security Error" */
    function mandatoryBroadcastRelatedSecurityCheck(p) {
        if (!p.isBroadcastRelated) {
            throw new DOMException('', 'SecurityError');
        }
    }

    function raiseStreamEventError(name, listener) {
        const event = new Event('StreamEvent');
        Object.assign(event, {
            name: name,
            data: '',
            text: '',
            status: 'error',
        });
        hbbtv.utils.runOnMainLooper(this, function() {
            listener(event);
        });
    }

    function registerStreamEventListener(
        p,
        targetURL,
        eventName,
        listener,
        componentTag = -1,
        streamEventId = -1
    ) {
        //Check whether it is already added
        const streamEventID = getStreamEventID(targetURL, eventName);
        const streamEventInternalID = p.streamEventListenerIdMap.get(streamEventID);
        console.log('add Stream Event Listener with: ' + targetURL + ', on event:' + eventName);
        if (streamEventInternalID) {
            const streamEventListeners = p.streamEventListenerMap.get(streamEventInternalID);
            if (streamEventListeners) {
                if (!streamEventListeners.includes(listener)) {
                    streamEventListeners.push(listener);
                }
            } else {
                console.error(
                    'Unconsistent state, ' +
                    streamEventID +
                    '(' +
                    streamEventInternalID +
                    ') has no listeners.'
                );
            }
        } else {
            let resultId = hbbtv.bridge.broadcast.addStreamEventListener(
                targetURL,
                eventName,
                componentTag,
                streamEventId
            );
            if (resultId == -1) {
                console.error(
                    'Failed to add Stream Event Listener with: ' +
                    targetURL +
                    ', on event:' +
                    eventName
                );
                raiseStreamEventError(eventName, listener);
            } else {
                p.streamEventListenerIdMap.set(streamEventID, resultId);
                p.streamEventListenerMap.set(resultId, new Array(listener));
            }
        }
    }

    function unregisterAllStreamEventListeners(p) {
        p.streamEventListenerMap.clear();
        p.streamEventListenerIdMap.forEach(function(value, key) {
            hbbtv.bridge.broadcast.removeStreamEventListener(value);
        });
        p.streamEventListenerIdMap.clear();
    }

    function acquireActiveState() {
        if (gActiveStateOwner !== null) {
            const owner = hbbtv.utils.weakDeref(gActiveStateOwner);
            if (JSON.stringify(owner) !== JSON.stringify(this)) {
                return false;
            }
        }
        gActiveStateOwner = hbbtv.utils.weakRef(this);
        gObjectFinalizedWhileActive.register(this);
        return true;
    }

    function releaseActiveState() {
        if (gActiveStateOwner !== null) {
            const owner = hbbtv.utils.weakDeref(gActiveStateOwner);
            if (owner === this) {
                gObjectFinalizedWhileActive.unregister(this);
                hbbtv.bridge.broadcast.setPresentationSuspended(gBroadbandAvInUse);
                gActiveStateOwner = null;
            }
        }
    }

    function dispatchFocusEvent() {
        const event = new Event('focus');
        privates.get(this).eventDispatcher.dispatchEvent(event);
    }

    function dispatchBlurEvent() {
        const event = new Event('blur');
        privates.get(this).eventDispatcher.dispatchEvent(event);
    }

    function dispatchFullScreenChangeEvent() {
        const event = new Event('FullScreenChange');
        privates.get(this).eventDispatcher.dispatchEvent(event);
    }

    function dispatchChannelChangeErrorEvent(channel, errorState) {
        const event = new Event('ChannelChangeError');
        Object.assign(event, {
            channel: channel,
            errorState: errorState,
        });
        privates.get(this).eventDispatcher.dispatchEvent(event);
    }

    function dispatchChannelChangeSucceededEvent(channel) {
        const event = new Event('ChannelChangeSucceeded');
        Object.assign(event, {
            channel: channel,
        });
        privates.get(this).eventDispatcher.dispatchEvent(event);
    }

    function dispatchPlayStateChangeEvent(state, error) {
        const event = new Event('PlayStateChange');
        Object.assign(event, {
            state: state,
            error: error,
        });
        privates.get(this).eventDispatcher.dispatchEvent(event);
    }

    function dispatchProgrammesChanged() {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        const event = new Event('ProgrammesChanged');
        p.eventDispatcher.dispatchEvent(event);
    }

    function dispatchParentalRatingChange(contentID, ratings, DRMSystemID, blocked) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        const event = new Event('ParentalRatingChange');
        Object.assign(event, {
            contentID: contentID,
            ratings: ratings,
            DRMSystemID: DRMSystemID,
            blocked: blocked,
        });
        p.eventDispatcher.dispatchEvent(event);
    }

    function dispatchParentalRatingError(contentID, ratings, DRMSystemID) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        const event = new Event('ParentalRatingError');
        Object.assign(event, {
            contentID: contentID,
            ratings: ratings,
            DRMSystemID: DRMSystemID,
        });
        p.eventDispatcher.dispatchEvent(event);
    }

    function dispatchSelectedComponentChanged(componentType) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        const event = new Event('SelectedComponentChanged');
        Object.assign(event, {
            componentType: componentType,
        });
        p.eventDispatcher.dispatchEvent(event);
        const event2 = new Event('SelectedComponentChange');
        Object.assign(event2, {
            componentType: componentType,
        });
        p.eventDispatcher.dispatchEvent(event2);
    }

    function dispatchComponentChanged(componentType) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        const event = new Event('ComponentChanged');
        Object.assign(event, {
            componentType: componentType,
        });
        p.eventDispatcher.dispatchEvent(event);
    }

    function dispatchDRMRightsError(errorState, contentID, DRMSystemID, rightsIssuerURL) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        const event = new Event('DRMRightsError');
        Object.assign(event, {
            errorState: errorState,
            contentID: contentID,
            DRMSystemID: DRMSystemID,
            rightsIssuerURL: rightsIssuerURL,
        });
        p.eventDispatcher.dispatchEvent(event);
    }

    function dispatchStreamEvent(id, name, data, text, status, dashEventData) {
        const p = privates.get(this);
        mandatoryBroadcastRelatedSecurityCheck(p);
        const event = new Event('StreamEvent');
        const eventData = {
            name: name,
            data: data,
            text: text,
            status: status,
            DASHEvent: dashEventData
        };
        if (dashEventData) {
            // update the eventData reference
            hbbtv.objects.createDASHEvent(eventData);
        }
        Object.assign(event, eventData);
        const listeners = p.streamEventListenerMap.get(id);
        if (listeners) {
            listeners.forEach((listener) =>
                hbbtv.utils.runOnMainLooper(this, function() {
                    listener(event);
                })
            );
            if (status === 'error') {
                p.streamEventListenerMap.delete(id);
                for (let [key, value] of p.streamEventListenerIdMap) {
                    if (value === id) {
                        p.streamEventListenerIdMap.delete(key);
                        break;
                    }
                }
            }
        }
    }

    function setIsBroadcastRelated(value) {
        const p = privates.get(this);
        p.isBroadcastRelated = value;
        if (p.channelConfig !== null) {
            hbbtv.objects.ChannelConfig.setIsBroadcastRelated.call(p.channelConfig, value);
        }
    }

    function avComponentArrayToCollection(avArray) {
        let result = [];
        avArray.forEach(function(item, index) {
            switch (item.type) {
                case COMPONENT_TYPE_VIDEO:
                    result[index] = hbbtv.objects.createAVVideoComponent(item);
                    break;
                case COMPONENT_TYPE_AUDIO:
                    result[index] = hbbtv.objects.createAVAudioComponent(item);
                    break;
                case COMPONENT_TYPE_SUBTITLE:
                    result[index] = hbbtv.objects.createAVSubtitleComponent(item);
                    break;
                default:
                    result[index] = hbbtv.objects.createAVComponent(item);
            }
        }, this);
        return hbbtv.objects.createCollection(result);
    }

    function getComponentId(component) {
        let id = null;
        if (
            component.type == COMPONENT_TYPE_VIDEO &&
            hbbtv.objects.AVVideoComponent.prototype.isPrototypeOf(component)
        ) {
            id = hbbtv.objects.AVVideoComponent.getId.call(component);
        } else if (
            component.type == COMPONENT_TYPE_AUDIO &&
            hbbtv.objects.AVAudioComponent.prototype.isPrototypeOf(component)
        ) {
            id = hbbtv.objects.AVAudioComponent.getId.call(component);
        } else if (
            component.type == COMPONENT_TYPE_SUBTITLE &&
            hbbtv.objects.AVSubtitleComponent.prototype.isPrototypeOf(component)
        ) {
            id = hbbtv.objects.AVSubtitleComponent.getId.call(component);
        }
        if (id === undefined) {
            id = null;
        }
        return id;
    }

    function getStreamEventID(targetURL, eventName) {
        return targetURL + '::' + eventName;
    }

    function notifyBroadbandAvInUse(broadbandAvInUse) {
        // This is a "static" method that does not use a "this" variable. Call this method like:
        // hbbtv.objects.VideoBroadcast.notifyBroadbandAvInUse(true).
        const hasRealizedObject =
            gActiveStateOwner !== null && hbbtv.utils.weakDeref(gActiveStateOwner) !== null;
        if (gBroadbandAvInUse !== broadbandAvInUse) {
            gBroadbandAvInUse = broadbandAvInUse;
            if (hasRealizedObject) {
                // It's up to the realized object whether we suspsend broadcast presentation or not.
            } else {
                hbbtv.bridge.broadcast.setPresentationSuspended(broadbandAvInUse);
            }
        }
    }

    function initialise() {
        /* TODO: the video/broadcast embedded object (...) SHALL adhere to the tuner related security
         * requirements in section 10.1.3.1. => TLS handshake through a valid X.509v3 certificate */
        privates.set(this, {});
        const p = privates.get(this);
        p.eventDispatcher = new hbbtv.utils.EventDispatcher(this);
        /* Associates targetURL::eventName with internal ID */
        p.streamEventListenerIdMap = new defaultEntities.Map();
        /* Associates internal ID with registered listeners */
        p.streamEventListenerMap = new defaultEntities.Map();
        p.playState = PLAY_STATE_UNREALIZED;
        p.waitingPlayStateConnectingConfirm = false;
        p.fullScreen = false;
        p.x = 0;
        p.y = 0;
        p.width = 1280;
        p.height = 720;
        this.widescreen = true; // TODO
        p.display_none = this.style.display === 'none';

        // The application either starts off broadcast-independent or becomes broadcast-independent
        // when setChannel(null, ...) is called on the realized v/b object. Here we set we are
        // broadcast-related unless getCurrentChannel() throws SecurityError.
        p.currentChannelData = null;
        p.currentInstanceIndex = null;
        p.currentNonQuietChannelData = null;
        p.channelConfig = null;
        p.isTransitioningToBroadcastRelated = false;
        p.quiet = 0;
        setIsBroadcastRelated.call(this, true);
        try {
            const channelData = hbbtv.bridge.broadcast.getCurrentChannel();
            p.currentNonQuietChannelData = p.currentChannelData = hbbtv.objects.createChannel(
                channelData
            );
            p.currentInstanceIndex = channelData.currentInstanceIndex;
            p.channelConfig = hbbtv.objects.createChannelConfig();
        } catch (e) {
            if (e.name === 'SecurityError') {
                p.currentInstanceIndex = p.currentNonQuietChannelData = p.currentChannelData = null;
                setIsBroadcastRelated.call(this, false);
            } else {
                throw e;
            }
        }

        hbbtv.drmManager.registerVideoBroadcast(
            this,
            dispatchParentalRatingChange,
            dispatchParentalRatingError,
            dispatchDRMRightsError
        );
    }

    return {
        prototype: prototype,
        notifyBroadbandAvInUse: notifyBroadbandAvInUse,
        initialise: initialise,
    };
})();

hbbtv.objects.upgradeToVideoBroadcast = function(object) {
    /* TODO: Support only one active v/b object HbbTV 2.0.3 A.2.4.2 */
    Object.setPrototypeOf(object, hbbtv.objects.VideoBroadcast.prototype);
    hbbtv.objects.VideoBroadcast.initialise.call(object);
};

hbbtv.objectManager.registerObject({
    name: 'video/broadcast',
    mimeTypes: ['video/broadcast'],
    oipfObjectFactoryMethodName: 'createVideoBroadcastObject',
    upgradeObject: hbbtv.objects.upgradeToVideoBroadcast,
});
