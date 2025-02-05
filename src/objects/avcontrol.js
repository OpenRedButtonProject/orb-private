/**
 * @fileOverview OIPF A/V Control object.
 * See: {@link https://web.archive.org/web/20200219165053/http://www.oipf.tv/web-spec/volume5.html#av-control-object}
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
hbbtv.objects.AVControl = (function() {
    const PLAY_STATE_STOPPED = 0;
    const PLAY_STATE_PLAYING = 1;
    const PLAY_STATE_PAUSED = 2;
    const PLAY_STATE_CONNECTING = 3;
    const PLAY_STATE_BUFFERING = 4;
    const PLAY_STATE_FINISHED = 5;
    const PLAY_STATE_ERROR = 6;

    const playStates = {
        [PLAY_STATE_STOPPED]: 1,
        [PLAY_STATE_PLAYING]: 2,
        [PLAY_STATE_PAUSED]: 4,
        [PLAY_STATE_CONNECTING]: 8,
        [PLAY_STATE_BUFFERING]: 16,
        [PLAY_STATE_FINISHED]: 32,
        [PLAY_STATE_ERROR]: 64,
    };
    Object.freeze(playStates);

    const prototype = Object.create(HTMLObjectElement.prototype);
    const privates = new WeakMap();
    const avsInUse = new Set();
    const __bindToCurrentChannel = hbbtv.objects.VideoBroadcast.prototype.bindToCurrentChannel;
    const NONIFY_BROADBAND_TIMEOUT = 250;
    let bindtoCurrentChannelTimeoutId = -1;

    const observer = new MutationObserver(function(mutationsList) {
        for (const mutation of mutationsList) {
            for (const node of mutation.removedNodes) {
                if (node.nodeName && node.nodeName.toLowerCase() === 'object') {
                    const p = privates.get(node);
                    if (p && p.videoElement.parentNode) {
                        p.videoElement.parentNode.removeChild(p.videoElement);
                        updateMutationObservers.call(node);
                    }
                }
            }
            for (const node of mutation.addedNodes) {
                if (node.nodeName && node.nodeName.toLowerCase() === 'object') {
                    const p = privates.get(node);
                    if (p && p.videoElement.parentNode !== node.parentNode) {
                        hbbtv.utils.insertAfter(node.parentNode, p.videoElement, node);
                        hbbtv.utils.matchElementStyle(p.videoElement, node);
                        updateMutationObservers.call(node);
                    }
                }
            }
        }
    });
    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
    });

    hbbtv.utils.defineConstantProperties(prototype, {
        COMPONENT_TYPE_VIDEO: 0,
        COMPONENT_TYPE_AUDIO: 1,
        COMPONENT_TYPE_SUBTITLE: 2,
    });

    hbbtv.utils.defineGetterSetterProperties(prototype, {
        data: {
            set(val) {
                this.setAttribute('data', val);
            },
            get() {
                return this.getAttribute('data');
            },
        },
        width: {
            set(val) {
                this.setAttribute('width', val);
            },
            get() {
                return this.getAttribute('width');
            },
        },
        height: {
            set(val) {
                this.setAttribute('height', val);
            },
            get() {
                return this.getAttribute('height');
            },
        },
    });

    hbbtv.utils.defineGetterProperties(prototype, {
        fullscreen() {
            return privates.get(this).fullscreen;
        },
        playState() {
            return privates.get(this).playState;
        },
        playPosition() {
            const priv = privates.get(this);
            if (priv.seekPos !== undefined) {
                return priv.seekPos;
            }
            if (playStates[priv.playState] & 65) {
                // stopped and error
                return 0;
            }
            return Math.floor(priv.videoElement.currentTime * 1000);
        },
        playTime() {
            return privates.get(this).playTime;
        },
        speed() {
            return privates.get(this).speed;
        },
        error() {
            return privates.get(this).error;
        },
    });

    prototype.getAttribute = function(name) {
        if (name === 'data') {
            return privates.get(this).data;
        }
        return Element.prototype.getAttribute.apply(this, arguments);
    };

    prototype.setAttribute = function(name, value) {
        const priv = privates.get(this);
        if (name === 'width' || name === 'height') {
            if (!priv.fullscreen) {
                // first set the attribute and then update video dimensions
                HTMLObjectElement.prototype.setAttribute.apply(this, arguments);
                hbbtv.utils.matchElementStyle(priv.videoElement, this);
            }
            return;
        } else if (name === 'data') {
            if (value !== priv.data) {
                if (priv.playState !== PLAY_STATE_STOPPED) {
                    this.stop();
                }
                priv.data = value;
                priv.seekPos = undefined;
                priv.connected = false;
                setMediaSettings.call(this, priv.MediaSettingsConfiguration);
            }
        }
        HTMLObjectElement.prototype.setAttribute.apply(this, arguments);
    };

    prototype.removeAttribute = function(name) {
        if (name === 'data') {
            delete privates.get(this).data;
            if (priv.playState !== PLAY_STATE_STOPPED) {
                this.stop();
            }
            if (value !== this.data) {
                priv.seekPos = undefined;
                priv.connected = false;
                setMediaSettings.call(this, priv.MediaSettingsConfiguration);
            }
        }
        Element.prototype.removeAttribute.apply(this, arguments);
    };

    prototype.play = function(speed) {
        const priv = privates.get(this);
        const videoElement = priv.videoElement;
        console.log('A/V Control: Play title ' + this.data + ' with speed ' + speed);
        if (speed === undefined) speed = 1;

        function updateCurrentTime(speed) {
            const elapsed = new Date().getTime() - priv.rewindStartSystemTime;
            videoElement.currentTime = Math.max(
                priv.rewindStartVideoTime - (elapsed * -speed) / 1000.0,
                0
            );
        }

        if ((playStates[priv.playState] & 97) && (speed !== 0)) {
            // stopped, finished or error
            if (priv.playState !== PLAY_STATE_FINISHED) {
                priv.loop = priv.params.loop ? priv.params.loop[0] : false;
            }

            function populateTracks(track, id) {
                const ttmlUrl = track.split('src:').pop().trim().split(' ').shift();
                const lang = track.split('srclang:').pop().trim().split(' ').shift();
                const ext = ttmlUrl.split('.').pop();
                if (ext === 'ttml' || ext === 'xml') {
                    videoElement.innerHTML +=
                        "<track kind='subtitles' id='" +
                        id +
                        "' src='" +
                        ttmlUrl +
                        "' srclang='" +
                        lang +
                        "'/>";
                }
            }

            videoElement.innerHTML = '';
            let idCounter = 0;
            if (priv.params.captions) {
                for (const caption of priv.params.captions) {
                    populateTracks(caption, idCounter++);
                }
            }
            if (priv.params.subtitles) {
                for (const subtitle of priv.params.subtitles) {
                    populateTracks(subtitle, idCounter++);
                }
            }
            if (isStateTransitionValid.call(this, priv.playState, PLAY_STATE_CONNECTING)) {
                transitionToState.call(this, PLAY_STATE_CONNECTING);
                priv.xhr.open('HEAD', this.data);
                priv.xhr.send();
            }
        } else if (playStates[priv.playState] & 24 && speed === 0) {
            // buffering or connecting
            priv.xhr.abort();
            transitionToState.call(this, PLAY_STATE_PAUSED);
        } else if ((priv.playState === PLAY_STATE_PAUSED || (priv.playState === PLAY_STATE_STOPPED)) && !priv.connected) {
            if (speed !== 0) {
                transitionToState.call(this, PLAY_STATE_CONNECTING);
                priv.xhr.open('HEAD', this.data);
                priv.xhr.send();
            } else {
                transitionToState.call(this, PLAY_STATE_PAUSED);
            }
        } else if (playStates[priv.playState] & 6) {
            // playing or paused
            clearInterval(priv.rewindInterval);
            if (priv.targetSpeed < 0 && speed >= 0) {
                // add the pause event listener in case the requested speed
                // is greater than or equal to 0, and we are currently in
                // rewind mode, because it was removed when we first
                // entered that mode
                videoElement.onpause = priv.onPauseHandler;
            }
            if (speed > 0) {
                videoElement.playbackRate = speed;
                if (videoElement.paused) {
                    videoElement.play();
                } else {
                    transitionToState.call(this, PLAY_STATE_PLAYING);
                }
            } else if (speed == 0) {
                videoElement.pause();
                if (priv.targetSpeed <= 0) {
                    updateCurrentTime(priv.targetSpeed);
                    // here, because we are in rewind mode or stopped, the videoElement is already
                    // in paused state, and because of that the event listener will not
                    // be triggered, so we call explicitly transitionToState.call(thiz, PLAY_STATE_PAUSED);
                    transitionToState.call(this, PLAY_STATE_PAUSED);
                } else {
                    priv.onPauseHandler();
                }
            } else {
                // simulate rewind
                priv.rewindStartSystemTime = new Date().getTime();
                priv.rewindStartVideoTime = videoElement.currentTime;

                // remove the pause event handler as it dispatches pause event
                // on the following call to pause(), setting falsely the state to paused
                videoElement.onpause = undefined;
                videoElement.pause();

                priv.rewindInterval = setInterval(() => {
                    if (videoElement.currentTime == 0) {
                        // when on video reaches currentTime == 0,
                        // return to paused state
                        this.play(0);
                    } else {
                        updateCurrentTime(speed);
                    }
                }, 1000);

                priv.speed = speed;
                transitionToState.call(this, PLAY_STATE_PLAYING);
                dispatchEvent.call(this, 'PlaySpeedChanged', { speed: speed });
            }
        }
        priv.targetSpeed = speed;
        return true;
    };

    prototype.stop = function() {
        const priv = privates.get(this);
        priv.xhr.abort();
        if (transitionToState.call(this, PLAY_STATE_STOPPED)) {
            _internalStop.call(this);
            unloadSource.call(this);
        }

        if (priv.mediaSourceQueue.length !== 0) {
            while (priv.mediaSourceQueue.length) {
                priv.mediaSourceQueue.pop();
            }
        }
        return true;
    };

    prototype.queue = function(url) {
        const priv = privates.get(this);
        const videoElement = priv.videoElement;
        if (!url || url.length === 0) {
            priv.mediaSourceQueue.shift();
            return true;
        }

        if (
            priv.mediaSourceQueue.indexOf(url) >= 0 ||
            (this.data === url && playStates[priv.playState] & 30)
        ) {
            // playing, paused, connecting or buffering
            return false;
        }

        if (
            (priv.playState === PLAY_STATE_STOPPED && !this.data) ||
            playStates[priv.playState] & 96
        ) {
            // finished or error
            this.data = url;
            this.play(1);
        } else {
            priv.mediaSourceQueue.push(url);
        }

        return true;
    };

    prototype.seek = function(position) {
        const priv = privates.get(this);
        console.log('A/V Control: Seek to', position);
        if (
            priv.playState === PLAY_STATE_PLAYING ||
            (priv.playState === PLAY_STATE_PAUSED && priv.connected)
        ) {
            if (
                !isNaN(priv.videoElement.duration) &&
                position > 0 &&
                priv.videoElement.duration > position / 1000.0
            ) {
                if (priv.startDate) { /* dynamic DASH MPD */
                    priv.videoElement.currentTime = (priv.startDate + position) / 1000.0;
                } else {
                    priv.videoElement.currentTime = position / 1000.0;
                }

                // needed in case we are in rewind mode
                priv.rewindStartSystemTime = new Date().getTime();
                priv.rewindStartVideoTime = priv.videoElement.currentTime;
            } else {
                dispatchEvent.call(this, 'PlayPositionChanged', {
                    position: priv.videoElement.currentTime * 1000,
                });
            }
        } else {
            priv.seekPos = position;
        }
        return true;
    };

    prototype.setFullScreen = function(fullscreen) {
        const priv = privates.get(this);
        const videoWrapper = priv.videoElement;

        if (fullscreen) {
            if (!priv.fullscreen) {
                const bounds = this.getBoundingClientRect();
                videoWrapper.style.cssText =
                    `
               width: 1280px;
               height: 720px;
               left: ${this.offsetLeft - bounds.left}px;
               top: ${this.offsetTop - bounds.top}px;
               position: absolute;
               z-index:
            ` + (this.style.zIndex ? this.style.zIndex : 1);
                priv.fullscreen = true;
                dispatchEvent.call(this, 'FullScreenChange');
            }
        } else {
            if (priv.fullscreen) {
                hbbtv.utils.matchElementStyle(videoWrapper, this);
                priv.fullscreen = false;
                dispatchEvent.call(this, 'FullScreenChange');
            }
        }
    };

    prototype.focus = function() {
        privates.get(this).videoElement.focus();
    };

    prototype.setVolume = function(volume) {
        console.log('A/V Control: Setting volume to ', volume);
        if (volume < 0 || volume > 100) {
            console.log('A/V Control: Invalid volume value.');
            return false;
        }

        privates.get(this).videoElement.volume = volume / 100;
        return true;
    };

    prototype.getComponents = function(componentType) {
        return extractComponents.call(this, componentType, false);
    };

    prototype.getCurrentActiveComponents = function(componentType) {
        return extractComponents.call(this, componentType, true);
    };

    prototype.selectComponent = function(component) {
        const priv = privates.get(this);
        let enableComponent = true;
        if (component !== null) {
            if (typeof component === 'object') {
                if (playStates[priv.playState] & 6) {
                    // playing or paused
                    let selectedmediaSettings = createCustomMediaSettings.call(
                        this,
                        component,
                        enableComponent
                    );
                    setMediaSettings.call(this, selectedmediaSettings);
                } else {
                    priv.MediaSettingsConfiguration = createCustomMediaSettings.call(
                        this,
                        component,
                        enableComponent
                    );
                }
            } else if (typeof component === 'number') {
                if (playStates[priv.playState] & 6) {
                    // playing or paused
                    let preferredMediaSettings = createPreferedMediaSettings.call(this, component);
                    setMediaSettings.call(this, preferredMediaSettings);
                } else {
                    priv.MediaSettingsConfiguration = createPreferedMediaSettings.call(
                        this,
                        component
                    );
                }
            }
        }
    };

    prototype.unselectComponent = function(component) {
        const priv = privates.get(this);
        const videoElement = priv.videoElement;

        function stopRenderingComponent(componentType) {
            let tracks;
            switch (componentType) {
                case this.COMPONENT_TYPE_VIDEO:
                    videoElement.hidden = true;
                    tracks = videoElement.videoTracks;
                    if (tracks) {
                        for (const track of tracks) {
                            track.selected = false;
                        }
                    }
                    break;

                case this.COMPONENT_TYPE_AUDIO:
                    videoElement.muted = true;
                    tracks = videoElement.audioTracks;
                    if (tracks) {
                        for (const track of tracks) {
                            track.enabled = false;
                        }
                    }
                    break;

                case this.COMPONENT_TYPE_SUBTITLE:
                    if (hbbtv.bridge.configuration.getSubtitlesEnabled()) {
                        tracks = videoElement.textTracks;
                        if (tracks) {
                            for (const track of tracks) {
                                track.mode = 'hidden';
                            }
                        }
                    }
                    break;
            }
        }
        if (component !== null) {
            if (typeof component === 'object') {
                if (playStates[priv.playState] & 6) {
                    // playing or paused
                    if (component.type === this.COMPONENT_TYPE_VIDEO) {
                        for (const track of videoElement.videoTracks) {
                            if (track.id === component.componentTag) {
                                track.selected = false;
                                break;
                            }
                        }
                    } else {
                        let preferredMediaSettings = createPreferedMediaSettings.call(
                            this,
                            component.type
                        );
                        let tracksChanged = setMediaSettings.call(this, preferredMediaSettings);

                        if (tracksChanged === false) {
                            stopRenderingComponent.call(this, component.type);
                        }
                    }
                    dispatchComponentChangedEvent.call(this, component.type);
                }
            } else if (typeof component === 'number') {
                if (playStates[priv.playState] & 6) {
                    // playing or paused
                    stopRenderingComponent.call(this, component);
                    dispatchComponentChangedEvent.call(this, component);
                } else {
                    let isEnabled = false;
                    let componentDisabled = {};
                    componentDisabled.type = component;

                    priv.MediaSettingsConfiguration = createCustomMediaSettings.call(
                        this,
                        componentDisabled,
                        isEnabled
                    );
                }
            }
        }
    };

    prototype.addEventListener = function(type, listener) {
        privates.get(this).eventTarget.addEventListener(type, listener);
    };

    prototype.removeEventListener = function(type, listener) {
        privates.get(this).eventTarget.removeEventListener(type, listener);
    };

    function _internalStop() {
        const priv = privates.get(this);
        const videoElement = priv.videoElement;
        console.log('A/V Control: Stopping playback of ' + this.data);
        // remove the onpause event as it will be triggered when this
        // function is called
        videoElement.onpause = undefined;
        videoElement.pause();
        videoElement.currentTime = 0;
        clearInterval(priv.rewindInterval);
    }

    // helper function due to unclear event names between spec versions
    function dispatchComponentChangedEvent(type) {
        dispatchEvent.call(this, 'ComponentChanged', {
            componentType: type,
        });
        dispatchEvent.call(this, 'SelectedComponentChanged', {
            componentType: type,
        });
        dispatchEvent.call(this, 'SelectedComponentChange', {
            componentType: type,
        });
    }

    function extractComponents(componentType, onlyActive) {
        const priv = privates.get(this);
        const videoElement = priv.videoElement;
        let components = [];
        let returnAllComponentTypes = false;

        if (componentType === null || componentType === undefined) {
            returnAllComponentTypes = true;
        }
        //TODO propably not all codec & lang strings are oipf profile compatible
        if (playStates[priv.playState] & 22) {
            // playing or paused or buffering
            const videoTracks = videoElement.videoTracks;
            if (
                (returnAllComponentTypes || componentType === this.COMPONENT_TYPE_VIDEO) &&
                videoTracks
            ) {
                for (let i = 0; i < videoTracks.length; ++i) {
                    const videoTrack = videoTracks[i];
                    if (!onlyActive || videoTrack.selected) {
                        components.push({
                            // AVComponent properties
                            componentTag: parseInt(videoTrack.id),
                            pid: parseInt(videoTrack.id),
                            type: this.COMPONENT_TYPE_VIDEO,
                            encoding: videoTrack.encoding ?
                                videoTrack.encoding.split('"')[1] : undefined,
                            encrypted: videoTrack.encrypted,
                            aspectRatio: (
                                videoElement.videoWidth / videoElement.videoHeight
                            ).toFixed(2),
                        });
                    }
                }
            }

            const audioTracks = videoElement.audioTracks;

            function isMPEG4HEAAC(codecString) {
                if (codecString) {
                    const parts = codecString.split('.');
                    const codecFamily = parts[0];
                    const mpeg4Audio = parts[1];
                    const objectType = parts[2];
                    if (codecFamily === 'mp4a' && mpeg4Audio === '40') {
                        const heAacTypes = ['02', '05', '29']; // common HE-AAC object types for MPEG-4
                        return heAacTypes.includes(objectType);
                    }
                }
                return false;
            }

            function isEAC3(codecString) {
                if (codecString) {
                    const eac3Identifiers = ['ec-3', 'dd+', 'ddp', 'e-ac-3']; // common identifiers for E-AC-3
                    const normalizedCodecString = codecString.toLowerCase();
                    return eac3Identifiers.includes(normalizedCodecString);
                }
                return false;
            }

            if (
                (returnAllComponentTypes || componentType === this.COMPONENT_TYPE_AUDIO) &&
                audioTracks
            ) {
                for (let i = 0; i < audioTracks.length; ++i) {
                    const audioTrack = audioTracks[i];
                    if (!onlyActive || audioTrack.enabled) {
                        let trackEncoding = audioTrack.encoding ? audioTrack.encoding.split('"')[1] : undefined;
                        if (isMPEG4HEAAC(trackEncoding)) {
                            trackEncoding = "HEAAC";
                        } else if (isEAC3(trackEncoding)) {
                            trackEncoding = "E-AC3";
                        }

                        let language = 'und';
                        if (audioTrack.language) {
                            let lang;
                            if ((this.type !== 'application/dash+xml') &&
                                (lang = priv.ISO639_1_to_ISO639_2[audioTrack.language])) {
                                    language = lang;
                            } else {
                                language = audioTrack.language;
                            }
                        }

                        components.push({
                            // AVComponent properties
                            componentTag: audioTrack.id,
                            pid: parseInt(audioTrack.id),
                            type: this.COMPONENT_TYPE_AUDIO,
                            encoding: trackEncoding,
                            encrypted: audioTrack.encrypted,
                            // AVAudioComponent properties
                            language: language,
                            audioDescription: audioTrack.kind === 'alternate' ||
                                audioTrack.kind === 'alternative',
                            audioChannels: audioTrack.numChannels,
                        });
                    }
                }
            }

            const textTracks = videoElement.textTracks;
            if (
                (returnAllComponentTypes || componentType === this.COMPONENT_TYPE_SUBTITLE) &&
                textTracks
            ) {
                for (let i = 0; i < textTracks.length; ++i) {
                    const textTrack = textTracks[i];
                    if (!onlyActive || textTrack.mode === 'showing') {
                        components.push({
                            // AVComponent properties
                            componentTag: textTrack.id,
                            pid: parseInt(textTrack.id),
                            type: this.COMPONENT_TYPE_SUBTITLE,
                            encoding: textTrack.encoding ?
                                textTrack.encoding : 'application/ttml+xml',
                            encrypted: false,
                            language: textTrack.language,
                            hearingImpaired: textTrack.kind === 'captions',
                            label: textTrack.label,
                        });
                    }
                }
            }
        }

        // if (components.length == 0) {
        //    return undefined;
        // }

        return hbbtv.objects.createCollection(components);
    }

    // helper function for dispatching events
    function dispatchEvent(event, contextInfo) {
        const evt = new Event(event);
        if (contextInfo) {
            Object.assign(evt, contextInfo);
        }
        privates.get(this).eventTarget.dispatchEvent(evt);
        hbbtv.utils.runOnMainLooper(this, function() {
            if (typeof this['on' + event] === 'function') {
                if (contextInfo) {
                    this['on' + event](...Object.values(contextInfo));
                } else {
                    this['on' + event]();
                }
            }
        });
    }

    function createPreferedMediaSettings(componentType) {
        let audioSettings = {};
        let subSettings = {};
        let videoSettings = {};

        if (componentType === undefined || componentType === this.COMPONENT_TYPE_AUDIO) {
            let audioDescriptionEnabled = hbbtv.bridge.configuration.getAudioDescriptionEnabled();
            let preferredAudioLanguage = hbbtv.bridge.configuration.getPreferredAudioLanguage();
            audioSettings.isEnabled = true;
            audioSettings.lang = [];
            if (preferredAudioLanguage) {
                audioSettings.lang = preferredAudioLanguage.replace(/\s+/g, '').split(',');
            }

            if (audioDescriptionEnabled === true) {
                audioSettings.roles = 'alternate';
            }
        }

        if (componentType === undefined || componentType === this.COMPONENT_TYPE_SUBTITLE) {
            let preferredSubtitleLanguage =
                hbbtv.bridge.configuration.getPreferredSubtitleLanguage();
            let subtitlesEnabled = hbbtv.bridge.configuration.getSubtitlesEnabled();

            if (subtitlesEnabled === true) {
                subSettings.isEnabled = true;
                subSettings.lang = [];
                if (preferredSubtitleLanguage) {
                    subSettings.lang = preferredSubtitleLanguage.replace(/\s+/g, '').split(',');
                }
            }
        }

        if (componentType === undefined || componentType === this.COMPONENT_TYPE_VIDEO) {
            videoSettings.isEnabled = true;
            videoSettings.kind = ['main', ''];
        }

        return {
            audio: audioSettings,
            subtitles: subSettings,
            video: videoSettings,
        };
    }

    function createCustomMediaSettings(component, enableComponent) {
        let confSubtitlesEnabled = hbbtv.bridge.configuration.getSubtitlesEnabled();
        let audioSettings = {};
        let subSettings = {};
        let videoSettings = {};

        if (component) {
            if (component.type === this.COMPONENT_TYPE_AUDIO) {
                if (enableComponent) {
                    audioSettings.lang = [component.language];
                    audioSettings.audioChannels = component.audioChannels;
                    audioSettings.roles = component.audioDescription ? 'alternate' : 'main';
                    if (typeof component === 'object') {
                        audioSettings.id = component.componentTag;
                    }
                }
                audioSettings.isEnabled = enableComponent;
            } else if (component.type === this.COMPONENT_TYPE_SUBTITLE) {
                if (enableComponent) {
                    if (confSubtitlesEnabled === true) {
                        subSettings.lang = [component.language];
                        subSettings.roles = component.hearingImpaired ? 'captions' : 'subtitle';
                        if (typeof component === 'object') {
                            subSettings.id = component.componentTag;
                        }
                    }
                }
                subSettings.isEnabled = enableComponent;
            } else if (component.type === this.COMPONENT_TYPE_VIDEO) {
                if (enableComponent) {
                    videoSettings.kind = [component.kind];
                    if (typeof component === 'object') {
                        videoSettings.id = component.componentTag;
                    }
                }
                videoSettings.isEnabled = enableComponent;
            }
        }

        return {
            audio: audioSettings,
            subtitles: subSettings,
            video: videoSettings,
        };
    }

    function setMediaSettings(mediaSettings) {
        const priv = privates.get(this);
        const videoElement = priv.videoElement;
        let trackChanged = false;

        if (
            mediaSettings.audio &&
            Object.keys(mediaSettings.audio).length !== 0 &&
            mediaSettings.audio.isEnabled
        ) {
            let audioTracks = videoElement.audioTracks;
            if (audioTracks) {
                let index = -1;
                const languages = mediaSettings.audio.lang;
                if (languages) {
                    for (const lang of languages) {
                        for (let i = 0; i < audioTracks.length; ++i) {
                            const track = audioTracks[i];
                            let trackLanguage = track.language.includes('-') ? track.language.split('-')[0] : track.language;
                            if (
                                mediaSettings.audio.id === track.id ||
                                ((trackLanguage === lang ||
                                        hbbtv.languageCodes.ISO639_2_to_ISO639_1[trackLanguage] ===
                                        lang ||
                                        hbbtv.languageCodes.ISO639_2_to_ISO639_1[lang] ===
                                        trackLanguage) &&
                                    (!track.kind ||
                                        track.kind ===
                                        (mediaSettings.audio.roles ?
                                            mediaSettings.audio.roles :
                                            track.kind)) &&
                                    track.numChannels ===
                                    (mediaSettings.audio.audioChannels ?
                                        mediaSettings.audio.audioChannels :
                                        track.numChannels))
                            ) {
                                index = i;
                                break;
                            }
                        }
                        if (index !== -1) {
                            break;
                        }
                    }
                }
                if (index !== -1) {
                    audioTracks[index].enabled = true;
                    videoElement.muted = false;
                    trackChanged = true;
                    dispatchComponentChangedEvent.call(this, this.COMPONENT_TYPE_AUDIO);
                }
            }
        }

        if (
            mediaSettings.subtitles &&
            Object.keys(mediaSettings.subtitles).length !== 0 &&
            mediaSettings.subtitles.isEnabled
        ) {
            let textTracks = videoElement.textTracks;
            if (textTracks) {
                let index = -1;
                const languages = mediaSettings.subtitles.lang;

                if (languages) {
                    for (const lang of languages) {
                        for (let i = 0; i < textTracks.length; ++i) {
                            const track = textTracks[i];
                            if (
                                mediaSettings.subtitles.id === track.id ||
                                ((track.language === lang ||
                                        hbbtv.languageCodes.ISO639_2_to_ISO639_1[track.language] ===
                                        lang ||
                                        hbbtv.languageCodes.ISO639_2_to_ISO639_1[lang] ===
                                        track.language) &&
                                    track.kind ===
                                    (mediaSettings.subtitles.roles ?
                                        mediaSettings.subtitles.roles :
                                        track.kind))
                            ) {
                                index = i;
                                break;
                            }
                        }
                        if (index !== -1) {
                            break;
                        }
                    }

                    if (textTracks.length > 0 && index === -1 && languages.includes('***')) {
                        index = 0;
                    }
                    if (index !== -1) {
                        textTracks[index].mode = 'showing';
                        trackChanged = true;
                        dispatchComponentChangedEvent.call(this, this.COMPONENT_TYPE_SUBTITLE);
                    }
                }
            }
        }

        if (
            mediaSettings.video &&
            Object.keys(mediaSettings.video).length !== 0 &&
            mediaSettings.video.isEnabled
        ) {
            let videoTracks = videoElement.videoTracks;
            if (videoTracks && videoTracks.length > 0) {
                let index = -1;
                for (let i = 0; i < videoTracks.length; ++i) {
                    const track = videoTracks[i];
                    if (
                        mediaSettings.video.id === parseInt(track.id) ||
                        mediaSettings.video.kind.includes(track.kind)
                    ) {
                        index = i;
                        break;
                    }
                }
                if (index !== -1) {
                    videoTracks[index].selected = true;
                    trackChanged = true;
                    videoElement.hidden = false;
                    dispatchComponentChangedEvent.call(this, this.COMPONENT_TYPE_VIDEO);
                }
            }
        }

        return trackChanged;
    }

    function isStateTransitionValid(currentState, targetState) {
        switch (currentState) {
            case PLAY_STATE_STOPPED:
                return !!(playStates[targetState] & 13); // stopped, paused or connecting
            case PLAY_STATE_PLAYING:
                return !!(playStates[targetState] & 119); // playing, error, stopped, buffering, finished or paused
            case PLAY_STATE_PAUSED:
                return !!(playStates[targetState] & 31); // playing, paused, connecting, buffering or stopped
            case PLAY_STATE_CONNECTING:
                return !!(playStates[targetState] & 93); // connecting, paused, stopped, error or buffering
            case PLAY_STATE_BUFFERING:
                return !!(playStates[targetState] & 95); // buffering, paused, connecting, playing, stopped or error
            case PLAY_STATE_FINISHED:
            case PLAY_STATE_ERROR: // intentional fall-through
                return !!(playStates[targetState] & 9); // connecting or stopped
            default:
                break;
        }
        return false;
    }

    function transitionToState(targetState) {
        let priv = privates.get(this);
        if (isStateTransitionValid(priv.playState, targetState)) {
            console.log(
                'A/V Control: Transitioned from state ' + priv.playState + ' to ' + targetState
            );
            if (priv.playState !== targetState || (priv.playState === targetState) && (targetState === 1)) {
                priv.playState = targetState;

                dispatchEvent.call(this, 'PlayStateChange', {
                    state: targetState,
                });
            }
            return true;
        }
        console.warn(
            'A/V Control: Invalid transition from state ' + priv.playState + ' to ' + targetState
        );
        return false;
    }

    function bindToCurrentChannel() {
        if (avsInUse.size <= 0 && bindtoCurrentChannelTimeoutId === -1) {
            hbbtv.objects.VideoBroadcast.prototype.bindToCurrentChannel = __bindToCurrentChannel;
            return __bindToCurrentChannel.apply(this, arguments);
        } else {
            setTimeout(hbbtv.objects.VideoBroadcast.prototype.bindToCurrentChannel.bind(this, ...Array.from(arguments)), NONIFY_BROADBAND_TIMEOUT);
        }
    }

    function notifyBroadbandAvInUse(broadbandAvInUse) {
        //let priv = privates.get(this);
        if (broadbandAvInUse) {
            console.log('A/V control: AV in use');
            avsInUse.add(this);
            try {
                hbbtv.objects.VideoBroadcast.notifyBroadbandAvInUse(true);
                // we override bindToCurrentChannel to compensate the case where the
                // user calls it immediately after broacast is stopped, and as a result
                // the call to notifyBroadbandAvInUse(false) is missed
                hbbtv.objects.VideoBroadcast.prototype.bindToCurrentChannel = bindToCurrentChannel;
                //priv.videoElement.hidden = false;
            } catch (e) {
                console.warn('A/V Control: ' + e);
            }
        } else {
            console.log('A/V control: AV NOT in use (notification waiting 0.25s)');
            avsInUse.delete(this);
            bindtoCurrentChannelTimeoutId = setTimeout(() => {
                if (avsInUse.size <= 0) {
                    bindtoCurrentChannelTimeoutId = -1;
                    console.log('A/V control: AV NOT in use (notification dispatched)');
                    try {
                        hbbtv.objects.VideoBroadcast.notifyBroadbandAvInUse(false);
                        //priv.videoElement.hidden = true;
                    } catch (e) {
                        console.warn('A/V Control: ' + e);
                    }
                } else {
                    console.log('A/V control: Another AV is in use.');
                }
            }, NONIFY_BROADBAND_TIMEOUT);
        }
    }

    function unloadSource() {
        const priv = privates.get(this);
        priv.connected = false;
        priv.seekPos = undefined;
        priv.targetSpeed = priv.speed = 0;
        priv.videoElement.orb_unload();
        priv.unrealized = true;
    }

    function updateMutationObservers() {
        console.log("A/V Control: Updating ancestors' mutation observers...");
        const p = privates.get(this);
        // whenever there is a change on an ancestor style,
        // update the iframe style as well
        const ancestors = [];
        let parent = this.parentNode;
        while (parent) {
            ancestors.push(parent);
            parent = parent.parentNode;
        }

        for (const observer of p.styleObservers) {
            observer.disconnect();
        }
        p.styleObservers = [];

        const observerCallback = () => {
            hbbtv.utils.matchElementStyle(p.videoElement, this);
        };
        for (const ancestor of ancestors) {
            const styleObserver = new MutationObserver(observerCallback);
            styleObserver.observe(ancestor, {
                attributes: true,
                attributeFilter: ['style', 'class'],
            });
            p.styleObservers.push(styleObserver);
        }
    }

    function initialise() {
        let startPlaying = false;
        let seeking = false;
        let priv = privates.get(this);
        if (priv) {
            return; // already initialised
        }
        privates.set(this, {});
        priv = privates.get(this);
        priv.unrealized = true;
        priv.styleObservers = [];
        priv.playState = PLAY_STATE_STOPPED;
        priv.xhr = new XMLHttpRequest();
        const thiz = this;

        priv.ISO639_1_to_ISO639_2 = hbbtv.languageCodes.makeReverseMapping();
        priv.data = Element.prototype.getAttribute.call(this, 'data');

        function onPlayHandler() {
            transitionToState.call(thiz, PLAY_STATE_PLAYING);
            if (priv.seekPos !== undefined) {
                const seekPos = priv.seekPos;
                priv.seekPos = undefined;
                thiz.seek(seekPos);
            }
        }

        priv.onPauseHandler = () => {
            // this condition is used to compensate the situation where the
            // video element dispatches pause AND ended events (instead of just
            // the ended event) when playback is finished, messing up the state
            // machine pipeline
            if (!videoElement.ended && thiz.playState !== PLAY_STATE_PAUSED) {
                transitionToState.call(thiz, PLAY_STATE_PAUSED);
            }
        };

        // Create a new video element that will be used as a playback backend 'video/mp4' objects.
        const mimetype = this.type || '';
        let videoElement = document.createElement(mimetype.startsWith('audio') ? 'audio' : 'video');

        videoElement.autoplay = false;
        //videoElement.hidden = true;
        priv.videoElement = videoElement;
        if (this.parentNode) {
            hbbtv.utils.insertAfter(this.parentNode, videoElement, this);
            hbbtv.utils.matchElementStyle(videoElement, this);
            updateMutationObservers.call(this);
        }

        // parse param nodes and store their values
        priv.params = {};
        for (let node of this.getElementsByTagName('param')) {
            if (node.hasAttribute('name')) {
                const paramName = node.getAttribute('name');
                if (!priv.params[paramName]) {
                    priv.params[paramName] = [];
                }
                priv.params[paramName].push(window.decodeURIComponent(node.getAttribute('value')));
            }
        }
        priv.connected = false;
        priv.seekPos = undefined;
        priv.playTime = 0;
        priv.targetSpeed = priv.speed = 0;
        priv.eventTarget = document.createDocumentFragment();
        priv.mediaSourceQueue = [];
        priv.MediaSettingsConfiguration = createPreferedMediaSettings.call(this);
        priv.loop = 1;
        priv.fullscreen = false;

        this.addEventListener('PlayStateChange', (e) => {
            switch (e.state) {
                case PLAY_STATE_ERROR:
                case PLAY_STATE_STOPPED:
                case PLAY_STATE_FINISHED:
                    notifyBroadbandAvInUse.call(this, false);
                    break;
                default:
                    notifyBroadbandAvInUse.call(this, true);
                    break;
            }
        });

        // add a timeout to the XMLHTTPRequest to compensate the case where
        // a server side script intentionally delays the request.
        priv.xhr.timeout = 5000;

        priv.xhr.onreadystatechange = function() {
            if (priv.xhr.readyState != 4) return;
            // if status is 0, then the request timed out, but the resource requested exists,
            // so we skip the error state
            if (priv.xhr.status !== 0 && priv.xhr.status != 200 && priv.xhr.status != 304) {
                priv.error = 1;
                unloadSource.call(thiz);
                transitionToState.call(thiz, PLAY_STATE_ERROR);
                return;
            }
            //transitionToState.call(thiz, PLAY_STATE_BUFFERING);
            videoElement.src = thiz.data;
        };

        videoElement.addEventListener('loadeddata', () => {
            if (!videoElement.src) {
                return;
            }

            // we add here the onpause handler as there will be no way to be added
            // in case the user changes the media source when we are in rewind mode
            videoElement.onpause = priv.onPauseHandler;
            videoElement.playbackRate = priv.targetSpeed;
            priv.connected = true;
            if (priv.targetSpeed > 0) {
                videoElement.play();
            } else {
                priv.onPauseHandler();
            }
        });

        videoElement.addEventListener('loadedmetadata', () =>
            {
                transitionToState.call(this, PLAY_STATE_BUFFERING);
                setMediaSettings.call(this, priv.MediaSettingsConfiguration);
            }
        );

        videoElement.addEventListener('waiting', () => {
            transitionToState.call(thiz, PLAY_STATE_BUFFERING);
            if (!seeking) {
                videoElement.oncanplaythrough = () => {
                    videoElement.oncanplaythrough = undefined;
                    priv.unrealized = false;
                    startPlaying = true;
                };
            }
        });

        videoElement.addEventListener('play', () => {
            priv.unrealized = false;
            startPlaying = true;
        });

        videoElement.addEventListener('seeking', () => {
            if (!priv.unrealized && !startPlaying && !seeking) {
                seeking = true;
            }
        });

        videoElement.addEventListener('seeked', () => {
            if (seeking && (priv.targetSpeed > 0)) {
                transitionToState.call(thiz, PLAY_STATE_PLAYING);
                seeking = false;
            }
        });

        videoElement.addEventListener('durationchange', () => {
            console.log('A/V Control: Received event ondurationchange ', videoElement.duration);
            priv.playTime = videoElement.duration * 1000;
        });

        videoElement.addEventListener('timeupdate', () => {
            if (startPlaying) {
                onPlayHandler();
                startPlaying = false;
            } else if (!seeking) {
                dispatchEvent.call(thiz, 'PlayPositionChanged', {
                    position: thiz.playPosition,
                });
            }
        });

        videoElement.addEventListener('ended', () => {
            if (priv.params.loop) {
                if (priv.loop === 'infinite' || --priv.loop > 0) {
                    videoElement.play();
                } else if (transitionToState.call(thiz, PLAY_STATE_FINISHED)) {
                    unloadSource.call(thiz);
                }
            } else if (transitionToState.call(thiz, PLAY_STATE_FINISHED)) {
                if (priv.mediaSourceQueue.length !== 0) {
                    _internalStop.call(thiz);
                    priv.data = priv.mediaSourceQueue.shift();
                    thiz.play(1);
                } else {
                    unloadSource.call(thiz);
                }
            }
        });

        videoElement.addEventListener('__orb_startDateUpdated__', (e) => {
            priv.startDate = e.startDate;
        });

        videoElement.addEventListener('__orb_onerror__', (e) => {
            console.log('A/V Control: __orb_onerror__: ', e.error.message);
            if (transitionToState.call(thiz, PLAY_STATE_ERROR)) {
                unloadSource.call(thiz);
                priv.error = e.error.code;
            }

            if (priv.mediaSourceQueue.length !== 0) {
                while (priv.mediaSourceQueue.length) {
                    priv.mediaSourceQueue.pop();
                }
            }
        });

        videoElement.addEventListener('__orb_onplayspeedchanged__', (e) => {
            /* Rely on videoElement.onpause to trigger PlaySpeedChanged. It is undefined when simulating rewind. */
            if (videoElement.onpause) {
                priv.speed = e.speed;
                if (e.speed) {
                    priv.targetSpeed = e.speed;
                }
                dispatchEvent.call(this, 'PlaySpeedChanged', {
                    speed: e.speed,
                });
            }
        });

        videoElement.addEventListener('__orb_onparentalratingchange__', (e) => {
            console.log('A/V Control: __orb_onparentalratingchange__: ', e.blocked);
            dispatchEvent.call(thiz, 'ParentalRatingChange', {
                contentID: e.contentID,
                ratings: e.ratings,
                DRMSystemID: e.DRMSystemID,
                blocked: e.blocked,
            });
        });

        // Mutation observer
        (function() {
            const observer = new MutationObserver(function(mutationsList) {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.removedNodes) {
                            if (
                                node.nodeName &&
                                node.nodeName.toLowerCase() === 'param' &&
                                node.hasAttribute('name')
                            ) {
                                // remove stored params
                                priv.params[node.getAttribute('name')] = undefined;
                            }
                        }
                        for (const node of mutation.addedNodes) {
                            if (
                                node.nodeName &&
                                node.nodeName.toLowerCase() === 'param' &&
                                node.hasAttribute('name')
                            ) {
                                // add params as they come
                                if (!priv.params[node.getAttribute('name')]) {
                                    priv.params[node.getAttribute('name')] = [];
                                }
                                priv.params[node.getAttribute('name')].push(
                                    window.decodeURIComponent(node.getAttribute('value'))
                                );
                            }
                        }
                    } else if (mutation.type === 'attributes') {
                        // if we are in fullscreen mode when the style of the AV Control
                        // object changes, switch to non-fullscreen mode
                        if (priv.fullscreen) {
                            priv.fullscreen = false;
                            dispatchEvent.call(thiz, 'FullScreenChange');
                        }
                        hbbtv.utils.matchElementStyle(videoElement, thiz);
                    }
                }
            });

            observer.observe(thiz, {
                childList: true,
                attributes: true,
                attributeFilter: ['style', 'class'],
            });
        })();

        console.log('A/V Control: initialised');
    }

    return {
        prototype: prototype,
        initialise: initialise,
    };
})();

hbbtv.objectManager.registerObject({
    name: 'video/mpeg',
    mimeTypes: ['video/mp4', 'application/dash+xml', 'audio/mp4', 'audio/mpeg', 'video/mpeg'],
    oipfObjectFactoryMethodName: 'createVideoMpegObject',
    upgradeObject: function(object) {
        Object.setPrototypeOf(object, hbbtv.objects.AVControl.prototype);
        hbbtv.objects.AVControl.initialise.call(object);
        hbbtv.utils.preventDefaultMediaHandling(object);
    },
});