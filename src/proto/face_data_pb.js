/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
(function($protobuf) {
    "use strict";

    // Common aliases
    var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;
    
    // Exported root namespace
    var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});
    
    $root.MeshData = (function() {
    
        /**
         * Properties of a MeshData.
         * @exports IMeshData
         * @interface IMeshData
         * @property {number|null} [index] MeshData index
         * @property {Array.<number>|null} [weights] MeshData weights
         */
    
        /**
         * Constructs a new MeshData.
         * @exports MeshData
         * @classdesc Represents a MeshData.
         * @implements IMeshData
         * @constructor
         * @param {IMeshData=} [properties] Properties to set
         */
        function MeshData(properties) {
            this.weights = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }
    
        /**
         * MeshData index.
         * @member {number} index
         * @memberof MeshData
         * @instance
         */
        MeshData.prototype.index = 0;
    
        /**
         * MeshData weights.
         * @member {Array.<number>} weights
         * @memberof MeshData
         * @instance
         */
        MeshData.prototype.weights = $util.emptyArray;
    
        /**
         * Creates a new MeshData instance using the specified properties.
         * @function create
         * @memberof MeshData
         * @static
         * @param {IMeshData=} [properties] Properties to set
         * @returns {MeshData} MeshData instance
         */
        MeshData.create = function create(properties) {
            return new MeshData(properties);
        };
    
        /**
         * Encodes the specified MeshData message. Does not implicitly {@link MeshData.verify|verify} messages.
         * @function encode
         * @memberof MeshData
         * @static
         * @param {IMeshData} message MeshData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MeshData.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.index != null && Object.hasOwnProperty.call(message, "index"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.index);
            if (message.weights != null && message.weights.length) {
                writer.uint32(/* id 2, wireType 2 =*/18).fork();
                for (var i = 0; i < message.weights.length; ++i)
                    writer.float(message.weights[i]);
                writer.ldelim();
            }
            return writer;
        };
    
        /**
         * Encodes the specified MeshData message, length delimited. Does not implicitly {@link MeshData.verify|verify} messages.
         * @function encodeDelimited
         * @memberof MeshData
         * @static
         * @param {IMeshData} message MeshData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MeshData.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };
    
        /**
         * Decodes a MeshData message from the specified reader or buffer.
         * @function decode
         * @memberof MeshData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {MeshData} MeshData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MeshData.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.MeshData();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.index = reader.int32();
                        break;
                    }
                case 2: {
                        if (!(message.weights && message.weights.length))
                            message.weights = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.weights.push(reader.float());
                        } else
                            message.weights.push(reader.float());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };
    
        /**
         * Decodes a MeshData message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof MeshData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {MeshData} MeshData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MeshData.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };
    
        /**
         * Verifies a MeshData message.
         * @function verify
         * @memberof MeshData
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        MeshData.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.index != null && message.hasOwnProperty("index"))
                if (!$util.isInteger(message.index))
                    return "index: integer expected";
            if (message.weights != null && message.hasOwnProperty("weights")) {
                if (!Array.isArray(message.weights))
                    return "weights: array expected";
                for (var i = 0; i < message.weights.length; ++i)
                    if (typeof message.weights[i] !== "number")
                        return "weights: number[] expected";
            }
            return null;
        };
    
        /**
         * Creates a MeshData message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof MeshData
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {MeshData} MeshData
         */
        MeshData.fromObject = function fromObject(object) {
            if (object instanceof $root.MeshData)
                return object;
            var message = new $root.MeshData();
            if (object.index != null)
                message.index = object.index | 0;
            if (object.weights) {
                if (!Array.isArray(object.weights))
                    throw TypeError(".MeshData.weights: array expected");
                message.weights = [];
                for (var i = 0; i < object.weights.length; ++i)
                    message.weights[i] = Number(object.weights[i]);
            }
            return message;
        };
    
        /**
         * Creates a plain object from a MeshData message. Also converts values to other types if specified.
         * @function toObject
         * @memberof MeshData
         * @static
         * @param {MeshData} message MeshData
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        MeshData.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.weights = [];
            if (options.defaults)
                object.index = 0;
            if (message.index != null && message.hasOwnProperty("index"))
                object.index = message.index;
            if (message.weights && message.weights.length) {
                object.weights = [];
                for (var j = 0; j < message.weights.length; ++j)
                    object.weights[j] = options.json && !isFinite(message.weights[j]) ? String(message.weights[j]) : message.weights[j];
            }
            return object;
        };
    
        /**
         * Converts this MeshData to JSON.
         * @function toJSON
         * @memberof MeshData
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        MeshData.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };
    
        /**
         * Gets the default type url for MeshData
         * @function getTypeUrl
         * @memberof MeshData
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        MeshData.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/MeshData";
        };
    
        return MeshData;
    })();
    
    $root.JointData = (function() {
    
        /**
         * Properties of a JointData.
         * @exports IJointData
         * @interface IJointData
         * @property {Array.<number>|null} [translate] JointData translate
         * @property {Uint8Array|null} [rotate] JointData rotate
         */
    
        /**
         * Constructs a new JointData.
         * @exports JointData
         * @classdesc Represents a JointData.
         * @implements IJointData
         * @constructor
         * @param {IJointData=} [properties] Properties to set
         */
        function JointData(properties) {
            this.translate = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }
    
        /**
         * JointData translate.
         * @member {Array.<number>} translate
         * @memberof JointData
         * @instance
         */
        JointData.prototype.translate = $util.emptyArray;
    
        /**
         * JointData rotate.
         * @member {Uint8Array} rotate
         * @memberof JointData
         * @instance
         */
        JointData.prototype.rotate = $util.newBuffer([]);
    
        /**
         * Creates a new JointData instance using the specified properties.
         * @function create
         * @memberof JointData
         * @static
         * @param {IJointData=} [properties] Properties to set
         * @returns {JointData} JointData instance
         */
        JointData.create = function create(properties) {
            return new JointData(properties);
        };
    
        /**
         * Encodes the specified JointData message. Does not implicitly {@link JointData.verify|verify} messages.
         * @function encode
         * @memberof JointData
         * @static
         * @param {IJointData} message JointData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        JointData.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.translate != null && message.translate.length) {
                writer.uint32(/* id 1, wireType 2 =*/10).fork();
                for (var i = 0; i < message.translate.length; ++i)
                    writer.float(message.translate[i]);
                writer.ldelim();
            }
            if (message.rotate != null && Object.hasOwnProperty.call(message, "rotate"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.rotate);
            return writer;
        };
    
        /**
         * Encodes the specified JointData message, length delimited. Does not implicitly {@link JointData.verify|verify} messages.
         * @function encodeDelimited
         * @memberof JointData
         * @static
         * @param {IJointData} message JointData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        JointData.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };
    
        /**
         * Decodes a JointData message from the specified reader or buffer.
         * @function decode
         * @memberof JointData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {JointData} JointData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        JointData.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.JointData();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.translate && message.translate.length))
                            message.translate = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.translate.push(reader.float());
                        } else
                            message.translate.push(reader.float());
                        break;
                    }
                case 2: {
                        message.rotate = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };
    
        /**
         * Decodes a JointData message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof JointData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {JointData} JointData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        JointData.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };
    
        /**
         * Verifies a JointData message.
         * @function verify
         * @memberof JointData
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        JointData.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.translate != null && message.hasOwnProperty("translate")) {
                if (!Array.isArray(message.translate))
                    return "translate: array expected";
                for (var i = 0; i < message.translate.length; ++i)
                    if (typeof message.translate[i] !== "number")
                        return "translate: number[] expected";
            }
            if (message.rotate != null && message.hasOwnProperty("rotate"))
                if (!(message.rotate && typeof message.rotate.length === "number" || $util.isString(message.rotate)))
                    return "rotate: buffer expected";
            return null;
        };
    
        /**
         * Creates a JointData message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof JointData
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {JointData} JointData
         */
        JointData.fromObject = function fromObject(object) {
            if (object instanceof $root.JointData)
                return object;
            var message = new $root.JointData();
            if (object.translate) {
                if (!Array.isArray(object.translate))
                    throw TypeError(".JointData.translate: array expected");
                message.translate = [];
                for (var i = 0; i < object.translate.length; ++i)
                    message.translate[i] = Number(object.translate[i]);
            }
            if (object.rotate != null)
                if (typeof object.rotate === "string")
                    $util.base64.decode(object.rotate, message.rotate = $util.newBuffer($util.base64.length(object.rotate)), 0);
                else if (object.rotate.length >= 0)
                    message.rotate = object.rotate;
            return message;
        };
    
        /**
         * Creates a plain object from a JointData message. Also converts values to other types if specified.
         * @function toObject
         * @memberof JointData
         * @static
         * @param {JointData} message JointData
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        JointData.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.translate = [];
            if (options.defaults)
                if (options.bytes === String)
                    object.rotate = "";
                else {
                    object.rotate = [];
                    if (options.bytes !== Array)
                        object.rotate = $util.newBuffer(object.rotate);
                }
            if (message.translate && message.translate.length) {
                object.translate = [];
                for (var j = 0; j < message.translate.length; ++j)
                    object.translate[j] = options.json && !isFinite(message.translate[j]) ? String(message.translate[j]) : message.translate[j];
            }
            if (message.rotate != null && message.hasOwnProperty("rotate"))
                object.rotate = options.bytes === String ? $util.base64.encode(message.rotate, 0, message.rotate.length) : options.bytes === Array ? Array.prototype.slice.call(message.rotate) : message.rotate;
            return object;
        };
    
        /**
         * Converts this JointData to JSON.
         * @function toJSON
         * @memberof JointData
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        JointData.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };
    
        /**
         * Gets the default type url for JointData
         * @function getTypeUrl
         * @memberof JointData
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        JointData.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/JointData";
        };
    
        return JointData;
    })();
    
    $root.FaceFrameData = (function() {
    
        /**
         * Properties of a FaceFrameData.
         * @exports IFaceFrameData
         * @interface IFaceFrameData
         * @property {number|null} [id] FaceFrameData id
         * @property {string|null} [s] FaceFrameData s
         * @property {number|null} [sf] FaceFrameData sf
         * @property {number|null} [ef] FaceFrameData ef
         * @property {Uint8Array|null} [bsw] FaceFrameData bsw
         * @property {Uint8Array|null} [cs] FaceFrameData cs
         * @property {Array.<IJointData>|null} [js] FaceFrameData js
         * @property {Array.<IMeshData>|null} [ms] FaceFrameData ms
         * @property {number|null} [bodyId] FaceFrameData bodyId
         * @property {number|null} [faceFrameType] FaceFrameData faceFrameType
         */
    
        /**
         * Constructs a new FaceFrameData.
         * @exports FaceFrameData
         * @classdesc Represents a FaceFrameData.
         * @implements IFaceFrameData
         * @constructor
         * @param {IFaceFrameData=} [properties] Properties to set
         */
        function FaceFrameData(properties) {
            this.js = [];
            this.ms = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }
    
        /**
         * FaceFrameData id.
         * @member {number} id
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.id = 0;
    
        /**
         * FaceFrameData s.
         * @member {string} s
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.s = "";
    
        /**
         * FaceFrameData sf.
         * @member {number} sf
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.sf = 0;
    
        /**
         * FaceFrameData ef.
         * @member {number} ef
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.ef = 0;
    
        /**
         * FaceFrameData bsw.
         * @member {Uint8Array} bsw
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.bsw = $util.newBuffer([]);
    
        /**
         * FaceFrameData cs.
         * @member {Uint8Array} cs
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.cs = $util.newBuffer([]);
    
        /**
         * FaceFrameData js.
         * @member {Array.<IJointData>} js
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.js = $util.emptyArray;
    
        /**
         * FaceFrameData ms.
         * @member {Array.<IMeshData>} ms
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.ms = $util.emptyArray;
    
        /**
         * FaceFrameData bodyId.
         * @member {number} bodyId
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.bodyId = 0;
    
        /**
         * FaceFrameData faceFrameType.
         * @member {number} faceFrameType
         * @memberof FaceFrameData
         * @instance
         */
        FaceFrameData.prototype.faceFrameType = 0;
    
        /**
         * Creates a new FaceFrameData instance using the specified properties.
         * @function create
         * @memberof FaceFrameData
         * @static
         * @param {IFaceFrameData=} [properties] Properties to set
         * @returns {FaceFrameData} FaceFrameData instance
         */
        FaceFrameData.create = function create(properties) {
            return new FaceFrameData(properties);
        };
    
        /**
         * Encodes the specified FaceFrameData message. Does not implicitly {@link FaceFrameData.verify|verify} messages.
         * @function encode
         * @memberof FaceFrameData
         * @static
         * @param {IFaceFrameData} message FaceFrameData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FaceFrameData.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.id);
            if (message.s != null && Object.hasOwnProperty.call(message, "s"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.s);
            if (message.sf != null && Object.hasOwnProperty.call(message, "sf"))
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.sf);
            if (message.ef != null && Object.hasOwnProperty.call(message, "ef"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.ef);
            if (message.bsw != null && Object.hasOwnProperty.call(message, "bsw"))
                writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.bsw);
            if (message.cs != null && Object.hasOwnProperty.call(message, "cs"))
                writer.uint32(/* id 11, wireType 2 =*/90).bytes(message.cs);
            if (message.js != null && message.js.length)
                for (var i = 0; i < message.js.length; ++i)
                    $root.JointData.encode(message.js[i], writer.uint32(/* id 12, wireType 2 =*/98).fork()).ldelim();
            if (message.ms != null && message.ms.length)
                for (var i = 0; i < message.ms.length; ++i)
                    $root.MeshData.encode(message.ms[i], writer.uint32(/* id 13, wireType 2 =*/106).fork()).ldelim();
            if (message.bodyId != null && Object.hasOwnProperty.call(message, "bodyId"))
                writer.uint32(/* id 14, wireType 0 =*/112).int32(message.bodyId);
            if (message.faceFrameType != null && Object.hasOwnProperty.call(message, "faceFrameType"))
                writer.uint32(/* id 15, wireType 0 =*/120).int32(message.faceFrameType);
            return writer;
        };
    
        /**
         * Encodes the specified FaceFrameData message, length delimited. Does not implicitly {@link FaceFrameData.verify|verify} messages.
         * @function encodeDelimited
         * @memberof FaceFrameData
         * @static
         * @param {IFaceFrameData} message FaceFrameData message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FaceFrameData.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };
    
        /**
         * Decodes a FaceFrameData message from the specified reader or buffer.
         * @function decode
         * @memberof FaceFrameData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {FaceFrameData} FaceFrameData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FaceFrameData.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.FaceFrameData();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.id = reader.int32();
                        break;
                    }
                case 2: {
                        message.s = reader.string();
                        break;
                    }
                case 3: {
                        message.sf = reader.int32();
                        break;
                    }
                case 4: {
                        message.ef = reader.int32();
                        break;
                    }
                case 5: {
                        message.bsw = reader.bytes();
                        break;
                    }
                case 11: {
                        message.cs = reader.bytes();
                        break;
                    }
                case 12: {
                        if (!(message.js && message.js.length))
                            message.js = [];
                        message.js.push($root.JointData.decode(reader, reader.uint32()));
                        break;
                    }
                case 13: {
                        if (!(message.ms && message.ms.length))
                            message.ms = [];
                        message.ms.push($root.MeshData.decode(reader, reader.uint32()));
                        break;
                    }
                case 14: {
                        message.bodyId = reader.int32();
                        break;
                    }
                case 15: {
                        message.faceFrameType = reader.int32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };
    
        /**
         * Decodes a FaceFrameData message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof FaceFrameData
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {FaceFrameData} FaceFrameData
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FaceFrameData.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };
    
        /**
         * Verifies a FaceFrameData message.
         * @function verify
         * @memberof FaceFrameData
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        FaceFrameData.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.id != null && message.hasOwnProperty("id"))
                if (!$util.isInteger(message.id))
                    return "id: integer expected";
            if (message.s != null && message.hasOwnProperty("s"))
                if (!$util.isString(message.s))
                    return "s: string expected";
            if (message.sf != null && message.hasOwnProperty("sf"))
                if (!$util.isInteger(message.sf))
                    return "sf: integer expected";
            if (message.ef != null && message.hasOwnProperty("ef"))
                if (!$util.isInteger(message.ef))
                    return "ef: integer expected";
            if (message.bsw != null && message.hasOwnProperty("bsw"))
                if (!(message.bsw && typeof message.bsw.length === "number" || $util.isString(message.bsw)))
                    return "bsw: buffer expected";
            if (message.cs != null && message.hasOwnProperty("cs"))
                if (!(message.cs && typeof message.cs.length === "number" || $util.isString(message.cs)))
                    return "cs: buffer expected";
            if (message.js != null && message.hasOwnProperty("js")) {
                if (!Array.isArray(message.js))
                    return "js: array expected";
                for (var i = 0; i < message.js.length; ++i) {
                    var error = $root.JointData.verify(message.js[i]);
                    if (error)
                        return "js." + error;
                }
            }
            if (message.ms != null && message.hasOwnProperty("ms")) {
                if (!Array.isArray(message.ms))
                    return "ms: array expected";
                for (var i = 0; i < message.ms.length; ++i) {
                    var error = $root.MeshData.verify(message.ms[i]);
                    if (error)
                        return "ms." + error;
                }
            }
            if (message.bodyId != null && message.hasOwnProperty("bodyId"))
                if (!$util.isInteger(message.bodyId))
                    return "bodyId: integer expected";
            if (message.faceFrameType != null && message.hasOwnProperty("faceFrameType"))
                if (!$util.isInteger(message.faceFrameType))
                    return "faceFrameType: integer expected";
            return null;
        };
    
        /**
         * Creates a FaceFrameData message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof FaceFrameData
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {FaceFrameData} FaceFrameData
         */
        FaceFrameData.fromObject = function fromObject(object) {
            if (object instanceof $root.FaceFrameData)
                return object;
            var message = new $root.FaceFrameData();
            if (object.id != null)
                message.id = object.id | 0;
            if (object.s != null)
                message.s = String(object.s);
            if (object.sf != null)
                message.sf = object.sf | 0;
            if (object.ef != null)
                message.ef = object.ef | 0;
            if (object.bsw != null)
                if (typeof object.bsw === "string")
                    $util.base64.decode(object.bsw, message.bsw = $util.newBuffer($util.base64.length(object.bsw)), 0);
                else if (object.bsw.length >= 0)
                    message.bsw = object.bsw;
            if (object.cs != null)
                if (typeof object.cs === "string")
                    $util.base64.decode(object.cs, message.cs = $util.newBuffer($util.base64.length(object.cs)), 0);
                else if (object.cs.length >= 0)
                    message.cs = object.cs;
            if (object.js) {
                if (!Array.isArray(object.js))
                    throw TypeError(".FaceFrameData.js: array expected");
                message.js = [];
                for (var i = 0; i < object.js.length; ++i) {
                    if (typeof object.js[i] !== "object")
                        throw TypeError(".FaceFrameData.js: object expected");
                    message.js[i] = $root.JointData.fromObject(object.js[i]);
                }
            }
            if (object.ms) {
                if (!Array.isArray(object.ms))
                    throw TypeError(".FaceFrameData.ms: array expected");
                message.ms = [];
                for (var i = 0; i < object.ms.length; ++i) {
                    if (typeof object.ms[i] !== "object")
                        throw TypeError(".FaceFrameData.ms: object expected");
                    message.ms[i] = $root.MeshData.fromObject(object.ms[i]);
                }
            }
            if (object.bodyId != null)
                message.bodyId = object.bodyId | 0;
            if (object.faceFrameType != null)
                message.faceFrameType = object.faceFrameType | 0;
            return message;
        };
    
        /**
         * Creates a plain object from a FaceFrameData message. Also converts values to other types if specified.
         * @function toObject
         * @memberof FaceFrameData
         * @static
         * @param {FaceFrameData} message FaceFrameData
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        FaceFrameData.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults) {
                object.js = [];
                object.ms = [];
            }
            if (options.defaults) {
                object.id = 0;
                object.s = "";
                object.sf = 0;
                object.ef = 0;
                if (options.bytes === String)
                    object.bsw = "";
                else {
                    object.bsw = [];
                    if (options.bytes !== Array)
                        object.bsw = $util.newBuffer(object.bsw);
                }
                if (options.bytes === String)
                    object.cs = "";
                else {
                    object.cs = [];
                    if (options.bytes !== Array)
                        object.cs = $util.newBuffer(object.cs);
                }
                object.bodyId = 0;
                object.faceFrameType = 0;
            }
            if (message.id != null && message.hasOwnProperty("id"))
                object.id = message.id;
            if (message.s != null && message.hasOwnProperty("s"))
                object.s = message.s;
            if (message.sf != null && message.hasOwnProperty("sf"))
                object.sf = message.sf;
            if (message.ef != null && message.hasOwnProperty("ef"))
                object.ef = message.ef;
            if (message.bsw != null && message.hasOwnProperty("bsw"))
                object.bsw = options.bytes === String ? $util.base64.encode(message.bsw, 0, message.bsw.length) : options.bytes === Array ? Array.prototype.slice.call(message.bsw) : message.bsw;
            if (message.cs != null && message.hasOwnProperty("cs"))
                object.cs = options.bytes === String ? $util.base64.encode(message.cs, 0, message.cs.length) : options.bytes === Array ? Array.prototype.slice.call(message.cs) : message.cs;
            if (message.js && message.js.length) {
                object.js = [];
                for (var j = 0; j < message.js.length; ++j)
                    object.js[j] = $root.JointData.toObject(message.js[j], options);
            }
            if (message.ms && message.ms.length) {
                object.ms = [];
                for (var j = 0; j < message.ms.length; ++j)
                    object.ms[j] = $root.MeshData.toObject(message.ms[j], options);
            }
            if (message.bodyId != null && message.hasOwnProperty("bodyId"))
                object.bodyId = message.bodyId;
            if (message.faceFrameType != null && message.hasOwnProperty("faceFrameType"))
                object.faceFrameType = message.faceFrameType;
            return object;
        };
    
        /**
         * Converts this FaceFrameData to JSON.
         * @function toJSON
         * @memberof FaceFrameData
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        FaceFrameData.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };
    
        /**
         * Gets the default type url for FaceFrameData
         * @function getTypeUrl
         * @memberof FaceFrameData
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FaceFrameData.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/FaceFrameData";
        };
    
        return FaceFrameData;
    })();
    
    $root.FaceFrameDataList = (function() {
    
        /**
         * Properties of a FaceFrameDataList.
         * @exports IFaceFrameDataList
         * @interface IFaceFrameDataList
         * @property {Array.<IFaceFrameData>|null} [data] FaceFrameDataList data
         */
    
        /**
         * Constructs a new FaceFrameDataList.
         * @exports FaceFrameDataList
         * @classdesc Represents a FaceFrameDataList.
         * @implements IFaceFrameDataList
         * @constructor
         * @param {IFaceFrameDataList=} [properties] Properties to set
         */
        function FaceFrameDataList(properties) {
            this.data = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }
    
        /**
         * FaceFrameDataList data.
         * @member {Array.<IFaceFrameData>} data
         * @memberof FaceFrameDataList
         * @instance
         */
        FaceFrameDataList.prototype.data = $util.emptyArray;
    
        /**
         * Creates a new FaceFrameDataList instance using the specified properties.
         * @function create
         * @memberof FaceFrameDataList
         * @static
         * @param {IFaceFrameDataList=} [properties] Properties to set
         * @returns {FaceFrameDataList} FaceFrameDataList instance
         */
        FaceFrameDataList.create = function create(properties) {
            return new FaceFrameDataList(properties);
        };
    
        /**
         * Encodes the specified FaceFrameDataList message. Does not implicitly {@link FaceFrameDataList.verify|verify} messages.
         * @function encode
         * @memberof FaceFrameDataList
         * @static
         * @param {IFaceFrameDataList} message FaceFrameDataList message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FaceFrameDataList.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.data != null && message.data.length)
                for (var i = 0; i < message.data.length; ++i)
                    $root.FaceFrameData.encode(message.data[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            return writer;
        };
    
        /**
         * Encodes the specified FaceFrameDataList message, length delimited. Does not implicitly {@link FaceFrameDataList.verify|verify} messages.
         * @function encodeDelimited
         * @memberof FaceFrameDataList
         * @static
         * @param {IFaceFrameDataList} message FaceFrameDataList message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FaceFrameDataList.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };
    
        /**
         * Decodes a FaceFrameDataList message from the specified reader or buffer.
         * @function decode
         * @memberof FaceFrameDataList
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {FaceFrameDataList} FaceFrameDataList
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FaceFrameDataList.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.FaceFrameDataList();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.data && message.data.length))
                            message.data = [];
                        message.data.push($root.FaceFrameData.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };
    
        /**
         * Decodes a FaceFrameDataList message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof FaceFrameDataList
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {FaceFrameDataList} FaceFrameDataList
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FaceFrameDataList.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };
    
        /**
         * Verifies a FaceFrameDataList message.
         * @function verify
         * @memberof FaceFrameDataList
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        FaceFrameDataList.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.data != null && message.hasOwnProperty("data")) {
                if (!Array.isArray(message.data))
                    return "data: array expected";
                for (var i = 0; i < message.data.length; ++i) {
                    var error = $root.FaceFrameData.verify(message.data[i]);
                    if (error)
                        return "data." + error;
                }
            }
            return null;
        };
    
        /**
         * Creates a FaceFrameDataList message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof FaceFrameDataList
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {FaceFrameDataList} FaceFrameDataList
         */
        FaceFrameDataList.fromObject = function fromObject(object) {
            if (object instanceof $root.FaceFrameDataList)
                return object;
            var message = new $root.FaceFrameDataList();
            if (object.data) {
                if (!Array.isArray(object.data))
                    throw TypeError(".FaceFrameDataList.data: array expected");
                message.data = [];
                for (var i = 0; i < object.data.length; ++i) {
                    if (typeof object.data[i] !== "object")
                        throw TypeError(".FaceFrameDataList.data: object expected");
                    message.data[i] = $root.FaceFrameData.fromObject(object.data[i]);
                }
            }
            return message;
        };
    
        /**
         * Creates a plain object from a FaceFrameDataList message. Also converts values to other types if specified.
         * @function toObject
         * @memberof FaceFrameDataList
         * @static
         * @param {FaceFrameDataList} message FaceFrameDataList
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        FaceFrameDataList.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.data = [];
            if (message.data && message.data.length) {
                object.data = [];
                for (var j = 0; j < message.data.length; ++j)
                    object.data[j] = $root.FaceFrameData.toObject(message.data[j], options);
            }
            return object;
        };
    
        /**
         * Converts this FaceFrameDataList to JSON.
         * @function toJSON
         * @memberof FaceFrameDataList
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        FaceFrameDataList.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };
    
        /**
         * Gets the default type url for FaceFrameDataList
         * @function getTypeUrl
         * @memberof FaceFrameDataList
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FaceFrameDataList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/FaceFrameDataList";
        };
    
        return FaceFrameDataList;
    })();

    return $root;
})(protobuf);
