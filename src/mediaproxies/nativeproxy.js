/**
 * @fileOverview The proxy for native playback.
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

hbbtv.objects.NativeProxy = (function() {
    const prototype = Object.create(HTMLMediaElement.prototype);
    const privates = new WeakMap();
    const playbackRateOwnProperty = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'playbackRate'
    );

    Object.defineProperty(prototype, 'playbackRate', {
        get() {
            return playbackRateOwnProperty.get.call(this);
        },
        set(value) {
            playbackRateOwnProperty.set.call(this, value);
            if (!this.paused) {
                let evt = new Event('__orb_onplayspeedchanged__');
                Object.assign(evt, {
                    speed: this.playbackRate
                });
                this.dispatchEvent(evt);
            }
        },
    });

    prototype.orb_getPeriods =
        prototype.orb_getMrsUrl =
        prototype.orb_getCurrentPeriod =
        prototype.orb_getCiAncillaryData =
        function() {
            return Promise.resolve();
        };
    prototype.orb_unload = function() {
        this.removeAttribute('src');
        this.load();
        return Promise.resolve();
    };

    function onLoadedMetadata(e) {
        if (e.orb_handled) {
            return;
        }
        e.stopImmediatePropagation();
        let promises = [];
        const thiz = this;
        const p = privates.get(this);
        const ttmlParser = p.ttmlParser;
        const trackElements = this.getElementsByTagName('track');
        const config = {
            videoModel: p.videoModel,
            streamInfo: {
                id: 0,
                start: 0,
                duration: this.duration,
            },
        };
        const textTracks = orb_dashjs.TextTracks(window).create(config);
        if (p.textTracks) {
            p.textTracks.deleteAllTextTracks();
        }
        p.textTracks = textTracks;
        textTracks.initialize();
        for (let i = 0; i < trackElements.length; ++i) {
            const trackElement = trackElements[i];
            if (!trackElement) {
                promises.push(Promise.reject("Text track doesn't match a track element."));
                break;
            }

            const textTrackInfo = new orb_dashjs.TextTrackInfo();
            textTrackInfo.isEmbedded = false;
            textTrackInfo.streamInfo = config.streamInfo;
            textTrackInfo.isTTML = true;
            textTrackInfo.captionData = null;
            textTrackInfo.kind = trackElement.kind;
            textTrackInfo.id = trackElement.id;
            textTrackInfo.lang = trackElement.srclang;
            textTrackInfo.label = trackElement.label;
            textTrackInfo.isFragmented = false;

            let src = trackElement.getAttribute('src');
            const ext = src.split('.').pop();
            if (ext === 'ttml' || ext === 'xml') {
                promises.push(
                    new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = function() {
                            if (xhr.readyState != XMLHttpRequest.DONE) return;
                            if (xhr.status !== 0 && xhr.status != 200 && xhr.status != 304) {
                                reject(
                                    "An error occurred when requesting the ttml source file '" +
                                    src +
                                    "'."
                                );
                                return;
                            }
                            textTrackInfo.defaultTrack = trackElement.default;
                            textTrackInfo.captionData = ttmlParser.parse(xhr.responseText, 0);

                            const nsResolver = (prefix) => {
                                const ns = {
                                    'tt': 'http://www.w3.org/ns/ttml',
                                    'ebuttm': 'urn:ebu:tt:metadata'
                                };
                                return ns[prefix] || null;
                            };
                            const fontElements = xhr.responseXML.evaluate(
                                '//tt:head/tt:styling/tt:metadata/ebuttm:font', xhr.responseXML,
                                nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

                            for (let i = 0; i < fontElements.snapshotLength; i++) {
                                const fontElement = fontElements.snapshotItem(i);
                                const fontFamilyName = fontElement.getAttribute('fontFamilyName');
                                const fontSrc = fontElement.getAttribute('src');

                                if (fontFamilyName && fontSrc) {
                                    var style = document.createElement('style');
                                    style.type = 'text/css';
                                    var fontFace = `@font-face { font-family: '${fontFamilyName}'; src: url('${fontSrc}') format('opentype'); font-weight: normal; font-style: normal;}`;
                                    style.appendChild(document.createTextNode(fontFace));
                                    document.head.appendChild(style);
                                }
                            }

                            textTracks.addTextTrack(textTrackInfo);
                            resolve();
                        };
                        if (!src.startsWith('http')) {
                            src =
                                document.baseURI.substring(
                                    document.baseURI.indexOf('base=') + 5,
                                    document.baseURI.lastIndexOf('/') + 1
                                ) + src;
                        }
                        xhr.open('GET', src);
                        xhr.send();
                    })
                );
            }
        }
        Promise.all(promises)
            .then(() => {
                textTracks.createTracks();
                for (const track of this.textTracks) {
                    track.encoding = 'application/ttml+xml';
                }
                p.onTextTrackChange();
                p.onAudioTrackChange();
                p.onVideoTrackChange();
            })
            .catch((e) => {
                console.warn('NativeProxy: Failed to populate texttracks. Error:', e);
            })
            .finally(() => {
                const evt = new Event(e.type, e);
                evt.orb_handled = true;
                thiz.dispatchEvent(evt);
            });

        const videoOwnProperty = Object.getOwnPropertyDescriptor(
            HTMLMediaElement.prototype,
            'videoTracks'
        );
        if (videoOwnProperty) {
            const videoTrackList = [];
            for (const track of videoOwnProperty.get.call(this)) {
                const t = {};
                for (const key in track) {
                    t[key] = track[key];
                }
                // ensure correct form (gstreamer)
                if (!isNaN(t.id)) 
                {
                    t.id = parseInt(track.id).toString();
                }
                t.index = videoTrackList.length;
                t.encoding = undefined;
                t.encrypted = false;
                videoTrackList.push(t);
            }
            this.videoTracks.orb_setTrackList(videoTrackList);
        }

        const audioOwnProperty = Object.getOwnPropertyDescriptor(
            HTMLMediaElement.prototype,
            'audioTracks'
        );
        if (audioOwnProperty) {
            const audioTrackList = [];
            for (const track of audioOwnProperty.get.call(this)) {
                const t = {};
                for (const key in track) {
                    t[key] = track[key];
                }
                // ensure correct form (gstreamer)
                if (!isNaN(t.id)) 
                {
                    t.id = parseInt(track.id).toString();
                }
                t.numChannels = 2;
                t.index = audioTrackList.length;
                t.encoding = undefined;
                t.encrypted = false;
                audioTrackList.push(t);
            }
            this.audioTracks.orb_setTrackList(audioTrackList);
        }
    }

    function onError() {
        if (this.error) {
            let evt = new Event('__orb_onerror__');
            let data = {
                code: 2,
                message: this.error.message,
            };

            if (hbbtv.native.name === 'rdk') {
                console.log(this.error);
                switch (this.error.code) {
                    case MediaError.MEDIA_ERR_DECODE:
                        data.code = 4; // content corrupt or invalid
                        break;
                    case MediaError.MEDIA_ERR_NETWORK:
                        data.code = 1; // cannot connect to server or connection lost
                        break;
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        let regex = /R1: Could not connect(.*): Connection timed out/;
                        if (this.error.message.match(regex)) {
                            data.code = 1; // cannot connect to server or connection lost
                        } else {
                            data.code = 0; // A/V format not supported
                        }
                        break;
                    default:
                        data.code = 2; // unidentified error
                        break;
                }
            } else {
                // normally, errors should be the distinguished by checking the value of
                // videoElement.error.code, but since its value is mostly 4, the only way
                // to differentiate the error events is by the videoElement.error.message value
                const err = this.error.message.split(':')[0];
                switch (err) {
                    case 'MEDIA_ELEMENT_ERROR':
                        data.code = 1; // MEDIA_ERR_NETWORK
                        break;
                    case 'DEMUXER_ERROR_COULD_NOT_OPEN':
                        data.code = 4; // MEDIA_ERR_DECODE
                        break;
                    case 'DEMUXER_ERROR_NO_SUPPORTED_STREAMS':
                        data.code = 0; // MEDIA_ERR_SRC_NOT_SUPPORTED
                        break;
                    default:
                        data.code = 2; // Unidentified error
                        break;
                }
            }

            Object.assign(evt, {
                error: data,
            });
            console.warn("NativeProxy: An error occurred on src '" + this.src + "':", this.error);
            this.dispatchEvent(evt);
        }
    }

    function onTextTrackChange() {
        const p = privates.get(this);
        let index = -1;
        for (let i = 0; i < this.textTracks.length; ++i) {
            if (this.textTracks[i].mode === 'showing') {
                index = i;
                break;
            }
        }
        if (p.textTracks) {
            p.textTracks.setCurrentTrackIdx(index);
        }
    }

    function onAudioTrackChange() {
        const audioOwnProperty = Object.getOwnPropertyDescriptor(
            HTMLMediaElement.prototype,
            'audioTracks'
        );
        const tracks = audioOwnProperty.get.call(this);
        for (let i = 0; i < this.audioTracks.length; ++i) {
            tracks[i].enabled = this.audioTracks[i].enabled;
        }
    }

    function onVideoTrackChange() {
        const videoOwnProperty = Object.getOwnPropertyDescriptor(
            HTMLMediaElement.prototype,
            'videoTracks'
        );
        const tracks = videoOwnProperty.get.call(this);
        for (let i = 0; i < this.videoTracks.length; ++i) {
            tracks[i].selected = this.videoTracks[i].selected;
        }
    }

    function initialise(src) {
        Element.prototype.setAttribute.call(this, 'src', src);
        Object.setPrototypeOf(this, prototype);
        privates.set(this, {});
        const p = privates.get(this);
        p.onTextTrackChange = onTextTrackChange.bind(this);
        p.onAudioTrackChange = onAudioTrackChange.bind(this);
        p.onVideoTrackChange = onVideoTrackChange.bind(this);
        p.onLoadedMetadata = onLoadedMetadata.bind(this);
        p.onError = onError.bind(this);
        p.videoModel = orb_dashjs.VideoModel(window).getInstance();
        p.videoModel.setElement(this);
        p.videoModel.setTTMLRenderingDiv(document.getElementById('orb_subsPH'));
        p.ttmlParser = orb_dashjs.TTMLParser(window).getInstance();

        this.textTracks.addEventListener('change', p.onTextTrackChange);
        this.audioTracks.addEventListener('change', p.onAudioTrackChange);
        this.videoTracks.addEventListener('change', p.onVideoTrackChange);
        this.addEventListener('loadedmetadata', p.onLoadedMetadata, true);
        this.addEventListener('error', p.onError, true);

        console.log('NativeProxy: Initialised NativeProxy.');
    }

    return {
        initialise: initialise,
    };
})();

hbbtv.mediaManager.registerObject({
    initialise: function(object, src) {
        hbbtv.objects.NativeProxy.initialise.call(object, src);
    },
    getName: function() {
        return 'native';
    },
    // TODO: add more extensions
    getSupportedExtensions: function() {
        return ['mp4', 'mp3', 'wav', 'mpeg'];
    },
    // TODO: add more content types
    getSupportedContentTypes: function() {
        return ['video/mp4', 'audio/mp4', 'audio/mpeg', 'video/mpeg'];
    },
});