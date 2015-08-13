(function main($window, $Ember, $FileReader) {

    "use strict";

    // Extract the commonly accessed Ember methods.
    const { Mixin, String, computed, get, set, run } = $Ember;

    /**
     * @constant STATUS_TYPES
     * @type {Object}
     */
    const STATUS_TYPES = { NONE: 0, VALID: 1, INVALID: 2, DELETED: 4, UPLOADED: 8, FAILED: 16 };

    /**
     * @constructor
     * @type {Model}
     */
    class Model {

        /**
         * @constructor
         * @param {File} [file={}]
         */
        constructor(file = {}) {
            this.file       = file;
            this.statusType = STATUS_TYPES.NONE;
        }

        /**
         * @method getMIMEType
         * @return {String}
         */
        getMIMEType() {
            return this.file.type || '';
        }

        /**
         * @method getFileSize
         * @return {Number}
         */
        getFileSize() {
            return typeof this.file.size !== 'undefined' ? this.file.size : Infinity;
        }

        /**
         * @method setStatusType
         * @param {Number} statusType
         * @return {void}
         */
        setStatusType(statusType) {
            this.statusType = Number(statusType);
        }

    }

    /**
     * @constant MIME_MODE
     * @type {Object}
     */
    const MIME_MODE = { PUSH: 'push', SET: 'set' };

    /**
     * @constant DEFAULT_OPTIONS
     * @type {Object}
     */
    const DEFAULT_OPTIONS = {

        /**
         * @property requestMethod
         * @type {String}
         */
        requestMethod: 'POST',

        /**
         * @property maximumSize
         * @type {Number|Infinity}
         */
        maximumSize: Infinity,

        /**
         * @property includeHeader
         * @type {Boolean}
         */
        includeHeader: true,

        /**
         * @property useArray
         * @type {Boolean}
         */
        useArray: false,

        /**
         * @property mimeTypes
         * @type {Array}
         */
        mimeTypes: ['image/jpeg', 'image/jpg', 'image/gif', 'image/png', 'image/tiff', 'image/bmp']

    };

    /**
     * @constant COMPUTED_OBSERVER
     * @type {Array}
     */
    const COMPUTED_OBSERVER = String.w('files.length', 'files.@each.statusType');

    /**
     * @constant MESSAGES
     * @type {Object}
     */
    const MESSAGES = {
        URL_REQUIRED: 'Droplet: You must specify the URL parameter when constructing your component.'
    };

    /**
     * @module Droplet
     * @author Adam Timberlake
     * @see https://github.com/Wildhoney/EmberDroplet
     */
    $window.Droplet = Mixin.create({

        /**
         * @property url
         * @throws {Error}
         * @type {Function}
         */
        url: () => { throw new Error(MESSAGES.URL_REQUIRED) },

        /**
         * @property options
         * @type {Object}
         */
        options: {},

        /**
         * @property hooks
         * @type {Object}
         */
        hooks: { didAdd: () => {}, didDelete: () => {}, didUpload: () => {} },

        /**
         * @property files
         * @type {Array}
         */
        files: [],

        /**
         * @property model
         * @type {Model}
         */
        model: Model,

        /**
         * @property statusTypes
         * @type {Object}
         */
        statusTypes: STATUS_TYPES,

        /**
         * @method init
         * @return {void}
         */
        init() {

            this._super();
            set(this, 'files', []);

            Object.keys(DEFAULT_OPTIONS).forEach(key => {

                // Copy across all of the options into the options map.
                set(this, `options.${key}`, DEFAULT_OPTIONS[key]);

            });

        },

        /**
         * @property uploadStatus
         * @type {Object}
         */
        uploadStatus: computed(function() {
            return { uploading: false, percentComplete: 0, error: false };
        }),

        /**
         * @property validFiles
         * @return {Array}
         */
        validFiles: computed(function() {
            return this.getFiles(STATUS_TYPES.VALID);
        }).property(COMPUTED_OBSERVER),

        /**
         * @property invalidFiles
         * @return {Array}
         */
        invalidFiles: computed(function() {
            return this.getFiles(STATUS_TYPES.INVALID);
        }).property(COMPUTED_OBSERVER),

        /**
         * @property uploadedFiles
         * @return {Array}
         */
        uploadedFiles: computed(function() {
            return this.getFiles(STATUS_TYPES.UPLOADED);
        }).property(COMPUTED_OBSERVER),

        /**
         * @property deletedFiles
         * @return {Array}
         */
        deletedFiles: computed(function() {
            return this.getFiles(STATUS_TYPES.DELETED);
        }).property(COMPUTED_OBSERVER),

        /**
         * @property requestSize
         * @return {Array}
         */
        requestSize: computed(function() {
            return get(this, 'validFiles').reduce((size, model) => size + model.getFileSize(), 0);
        }).property(COMPUTED_OBSERVER),

        /**
         * @method getFiles
         * @param {Number} statusType
         * @return {Array}
         */
        getFiles(statusType) {
            return this.files.filter(file => file.statusType & statusType);
        },

        /**
         * @method isValid
         * @param {Model} model
         * @return {Boolean}
         */
        isValid(model) {

            /**
             * @method validMime
             * @param {String} mimeType
             * @return {Function}
             */
            const validMime = mimeType => () => {

                const anyRegExp = this.get('options.mimeTypes').some(mimeType => mimeType instanceof RegExp);
                const mimeTypes = get(this, 'options.mimeTypes');

                if (!anyRegExp) {

                    // Simply indexOf check because none of the MIME types are regular expressions.
                    return !!~mimeTypes.indexOf(mimeType);

                }

                // Otherwise we'll need to iterate and validate individually.
                return mimeTypes.some(validMimeType => {

                    const isExact  = validMimeType === mimeType;
                    const isRegExp = !!mimeType.match(validMimeType);

                    return isExact || isRegExp;

                });

            };

            /**
             * @method validSize
             * @param {Number} fileSize
             * @return {Function}
             */
            const validSize = fileSize => () => fileSize <= Number(get(this, 'options.maximumSize'));

            /**
             * @method composeEvery
             * @param {Function} fns
             * @return {Function}
             */
            const composeEvery = (...fns) => model => fns.reverse().every(fn => fn(model));

            /**
             * @method isValid
             * @type {Function}
             */
            const isValid = composeEvery(
                validMime(model.getMIMEType()),
                validSize(model.getFileSize())
            );

            return isValid(model);

        },

        /**
         * @property actions
         * @type {Object}
         * @return {void}
         */
        actions: {

            /**
             * @method uploadFiles
             * @return {Ember.RSVP.Promise}
             */
            uploadFiles() {

                const isFunction = value => typeof value === 'function';
                const url        = isFunction(get(this, 'url')) ? get(this, 'url').apply(this) : get(this, 'url');
                const files      = get(this, 'files').filter(file => file.statusType & STATUS_TYPES.VALID);

                return new $Ember.RSVP.Promise((resolve, reject) => {

                    resolve({ files });

                }).then(response => {

                    get(this, 'hooks').didUpload(...response.files);

                }, (jqXHR, textStatus, error) => {

                });

            },

            /**
             * @method abortUpload
             * @return {void}
             */
            abortUpload() {

                var request = get(this, 'lastRequest');

                if (request && get(this, 'uploadStatus.uploading')) {
                    request.abort();
                    set(this, 'uploadStatus.uploading', false);
                }

            },

            /**
             * @method mimeTypes
             * @param {Array} mimeTypes
             * @param {Object} [mode=MIME_MODE.PUSH]
             * @return {void}
             */
            mimeTypes(mimeTypes, mode = MIME_MODE.PUSH) {
                mode === MIME_MODE.SET && set(this, 'options.mimeTypes', []);
                mimeTypes = Array.isArray(mimeTypes) ? mimeTypes : [mimeTypes];
                const types = [...get(this, 'options.mimeTypes'), ...mimeTypes];
                set(this, 'options.mimeTypes', types);
            },

            /**
             * @method addFiles
             * @param {Model[]} files
             * @return {void}
             */
            addFiles(...files) {

                const addedFiles = files.map(file => {

                    if (file instanceof Model) {

                        file.setStatusType(this.isValid(file) ? STATUS_TYPES.VALID : STATUS_TYPES.INVALID);
                        get(this, 'files').pushObject(file);
                        return file;

                    }

                }).filter(file => typeof file !== 'undefined');

                addedFiles.length && get(this, 'hooks').didAdd(...addedFiles);

            },

            /**
             * @method deleteFiles
             * @param {Model[]} files
             * @return {void}
             */
            deleteFiles(...files) {

                const deletedFiles = files.map((file) => {

                    const contains = !!~get(this, 'files').indexOf(file);

                    if (contains && file instanceof Model) {

                        file.setStatusType(STATUS_TYPES.DELETED);
                        get(this, 'files').removeObject(file);
                        return file;

                    }

                }).filter(file => typeof file !== 'undefined');

                deletedFiles.length && get(this, 'hooks').didDelete(...deletedFiles);

            },

            /**
             * @method clearFiles
             * @return {void}
             */
            clearFiles() {
                this.files.forEach(file => this.send('deleteFiles', file));
                this.files.length = 0;
            }

        }

    });

    /**
     * @method squashEvent
     * @param {Object} event
     * @return {void}
     */
    const squashEvent = event => {
        event.preventDefault();
        event.stopPropagation();
    };

    /**
     * @module Droplet
     * @submodule Area
     * @author Adam Timberlake
     * @see https://github.com/Wildhoney/EmberDroplet
     */
    $window.Droplet.Area = Mixin.create({

        /**
         * @property classNames
         * @type {Array}
         */
        classNames: ['droppable'],

        /**
         * @method parentView
         * @return {Object}
         */
        parentView() {
            return this.context.get('parentView') || {};
        },

        /**
         * @method drop
         * @param {Object} event
         * @return {Array}
         */
        drop(event) {
            squashEvent(event);
            return this.traverseFiles(event.dataTransfer.files);
        },

        /**
         * @method files
         * @param {FileList|Array} files
         * @return {Array}
         */
        traverseFiles(files) {

            // Convert the FileList object into an actual array.
            files = Array.from ? Array.from(files) : Array.prototype.slice.call(files);

            const models = files.reduce((current, file) => {

                const model = new Model(file);
                current.push(model);
                return current;

            }, []);

            // Add the files using the Droplet component.
            this.addFiles(files);
            return models;

        },

        /**
         * @method addFiles
         * @param {Array} models
         * @return {void}
         */
        addFiles(models) {

            if (models.length && this.parentView().send) {

                // Add the models to the parent if the parent exists, otherwise it's a no-op.
                this.parentView().send('addFiles', models);

            }

        },

        /**
         * @method dragEnter
         * @param {Object} event
         * @return {void}
         */
        dragEnter: squashEvent,

        /**
         * @method dragOver
         * @param {Object} event
         * @return {void}
         */
        dragOver: squashEvent,

        /**
         * @method dragLeave
         * @param {Object} event
         * @return {void}
         */
        dragLeave: squashEvent

    });

    /**
     * @module Droplet
     * @submodule Preview
     * @author Adam Timberlake
     * @see https://github.com/Wildhoney/EmberDroplet
     */
    $window.Droplet.Preview = Mixin.create({

        /**
         * @property tagName
         * @type {String}
         */
        tagName: 'img',

        /**
         * @property attributeBindings
         * @type {Array}
         */
        attributeBindings: ['src'],

        /**
         * @method reader
         * @type {FileReader|Object}
         */
        reader: new $FileReader(),

        /**
         * @property image
         * @type {File|Object}
         */
        image: { file: { type: '' } },

        /**
         * @method isImage
         * @type {File|Object} image
         * @return {Boolean}
         */
        isImage(image) {
            return !!image.type.match(/^image\//i);
        },

        /**
         * @method didInsertElement
         * @return {void}
         */
        didInsertElement() {

            var reader  = this.get('reader'),
                image   = get(this, 'image.file');

            if (!this.isImage(image)) {
                this.destroy();
                return;
            }

            reader.addEventListener('load', run.bind(this, event => {
                set(this, 'src', event.target.result);
            }));

            reader.readAsDataURL(image);

        }

    });

})(window, window.Ember, window.FileReader);
