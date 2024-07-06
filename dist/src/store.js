"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const mssql_1 = __importStar(require("mssql"));
const express_session_1 = require("express-session");
class MSSQLStore extends express_session_1.Store {
    constructor(config, options) {
        super();
        this.table = (options === null || options === void 0 ? void 0 : options.table) || 'sessions';
        this.ttl = (options === null || options === void 0 ? void 0 : options.ttl) || 1000 * 60 * 60 * 24;
        this.autoRemove = (options === null || options === void 0 ? void 0 : options.autoRemove) || false;
        this.autoRemoveInterval = (options === null || options === void 0 ? void 0 : options.autoRemoveInterval) || 1000 * 60 * 10;
        this.autoRemoveCallback = (options === null || options === void 0 ? void 0 : options.autoRemoveCallback) || undefined;
        this.useUTC = (options === null || options === void 0 ? void 0 : options.useUTC) || true;
        this.config = config;
        this.databaseConnection = new mssql_1.default.ConnectionPool(config);
    }
    async initializeDatabase() {
        // Attachs connect event listener and emits on successful connection
        this.databaseConnection.on('connect', () => this.emit('connect', this));
        // Attachs error event listener and emits on failed connection
        this.databaseConnection.on('error', (error) => this.emit('error', error));
        await this.databaseConnection.connect();
        this.databaseConnection.emit('connect');
        if (this.autoRemove) {
            setInterval(() => this.destroyExpired(this.autoRemoveCallback), this.autoRemoveInterval);
        }
    }
    async ready(callback) {
        var _a, _b;
        try {
            if (!this.databaseConnection.connected && !this.databaseConnection.connecting) {
                await this.initializeDatabase();
            }
            if ((_a = this.databaseConnection) === null || _a === void 0 ? void 0 : _a.connected) {
                return callback(null, null);
            }
            if ((_b = this.databaseConnection) === null || _b === void 0 ? void 0 : _b.connecting) {
                return this.databaseConnection.once('connect', callback.bind(this));
            }
            throw new Error('Connection is closed.');
        }
        catch (error) {
            if (callback) {
                callback(error);
            }
            return this.databaseConnection.emit('error', error);
        }
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Attachs sessionError event listener and emits on error on any
     * store error and includes method where error occured
     * @param method
     * @param error
     * @param callback
     */
    // ////////////////////////////////////////////////////////////////
    errorHandler(method, error, callback) {
        // eslint-disable-next-line no-shadow
        this.databaseConnection.once('sessionError', () => this.emit('sessionError', error, method));
        this.databaseConnection.emit('sessionError', error, method);
        if (callback) {
            return callback(error);
        }
        return undefined;
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Attempt to fetch all sessions
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    all(callback) {
        this.ready(async (error) => {
            if (error) {
                throw error;
            }
            try {
                const request = this.databaseConnection.request();
                const result = await request.query(`
              SELECT sid, session FROM ${this.table}`);
                if (result.recordset.length) {
                    const returnObject = {};
                    for (let i = 0; i < result.recordset.length; i += 1) {
                        returnObject[result.recordset[i].sid] = JSON.parse(result.recordset[i].session);
                    }
                    return callback(null, returnObject);
                }
                return callback(null, null);
            }
            catch (err) {
                return this.errorHandler('all', err, callback);
            }
        });
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Attempt to fetch session the given sid
     * @param sid
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    get(sid, callback) {
        this.ready(async (error) => {
            if (error) {
                throw error;
            }
            try {
                const request = this.databaseConnection.request();
                const result = await request.input('sid', mssql_1.VarChar(900), sid).query(`
              SELECT session FROM ${this.table} WHERE sid = @sid`);
                if (result.recordset.length) {
                    return callback(null, JSON.parse(result.recordset[0].session));
                }
                return callback(null, null);
            }
            catch (err) {
                return this.errorHandler('get', err, callback);
            }
        });
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Commit the given session object associated with the given sid
     * @param sid
     * @param session
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    set(sid, session, callback) {
        this.ready(async (error) => {
            var _a;
            if (error) {
                throw error;
            }
            try {
                /**
                 * Verify session.cookie.expires is not a boolean. If so, use current time along with
                 * ttl else cast session.cookie.expires to Date to avoid TS error
                 */
                const isExpireBoolean = !!session.cookie && typeof session.cookie.expires === 'boolean';
                const expires = new Date(isExpireBoolean || !((_a = session.cookie) === null || _a === void 0 ? void 0 : _a.expires)
                    ? Date.now() + this.ttl
                    : session.cookie.expires);
                const request = this.databaseConnection.request();
                await request
                    .input('sid', mssql_1.VarChar(900), sid)
                    .input('session', mssql_1.NVarChar(mssql_1.MAX), JSON.stringify(session))
                    .input('expires', mssql_1.DateTime, expires).query(`
              UPDATE ${this.table} 
                SET session = @session, expires = @expires 
                WHERE sid = @sid;
                IF @@ROWCOUNT = 0 
                  BEGIN
                    INSERT INTO ${this.table} (sid, session, expires)
                      VALUES (@sid, @session, @expires)
                  END;`);
                if (callback) {
                    return callback();
                }
                return null;
            }
            catch (err) {
                return this.errorHandler('set', err, callback);
            }
        });
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Update the expiration date of the given sid
     * @param sid
     * @param data
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    touch(sid, session, callback) {
        this.ready(async (error) => {
            var _a;
            if (error) {
                throw error;
            }
            try {
                /**
                 * Verify session.cookie.expires is not a boolean. If so, use current time along with
                 * ttl else cast session.cookie.expires to Date to avoid TS error
                 */
                const isExpireBoolean = !!session.cookie && typeof session.cookie.expires === 'boolean';
                const expires = new Date(isExpireBoolean || !((_a = session.cookie) === null || _a === void 0 ? void 0 : _a.expires)
                    ? Date.now() + this.ttl
                    : session.cookie.expires);
                const request = this.databaseConnection.request();
                await request.input('sid', mssql_1.VarChar(900), sid).input('expires', mssql_1.DateTime, expires).query(`
              UPDATE ${this.table} 
                SET expires = @expires 
              WHERE sid = @sid`);
                if (callback) {
                    return callback();
                }
                return null;
            }
            catch (err) {
                return this.errorHandler('touch', err, callback);
            }
        });
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Destroy the session associated with the given sid
     * @param sid
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    destroy(sid, callback) {
        this.ready(async (error) => {
            if (error) {
                throw error;
            }
            try {
                const request = this.databaseConnection.request();
                await request.input('sid', mssql_1.VarChar(900), sid).query(`
              DELETE FROM ${this.table} 
              WHERE sid = @sid`);
                if (callback) {
                    return callback();
                }
                return null;
            }
            catch (err) {
                return this.errorHandler('destroy', err, callback);
            }
        });
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Destroy expired sessions
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    destroyExpired(callback) {
        this.ready(async (error) => {
            if (error) {
                throw error;
            }
            try {
                const request = this.databaseConnection.request();
                await request.query(`
              DELETE FROM ${this.table} 
              WHERE expires <= GET${this.useUTC ? 'UTC' : ''}DATE()`);
                if (this.autoRemoveCallback) {
                    this.autoRemoveCallback();
                }
                if (callback) {
                    return callback();
                }
                return null;
            }
            catch (err) {
                if (this.autoRemoveCallback) {
                    this.autoRemoveCallback(err);
                }
                return this.errorHandler('destroyExpired', err, callback);
            }
        });
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Fetch total number of sessions
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    length(callback) {
        this.ready(async (error) => {
            if (error) {
                throw error;
            }
            try {
                const request = this.databaseConnection.request();
                const result = await request.query(`
              SELECT COUNT(sid) AS length
              FROM ${this.table}`);
                return callback(null, result.recordset[0].length);
            }
            catch (err) {
                return this.errorHandler('length', err, callback);
            }
        });
    }
    // ////////////////////////////////////////////////////////////////
    /**
     * Clear all sessions
     * @param callback
     */
    // //////////////////////////////////////////////////////////////
    clear(callback) {
        this.ready(async (error) => {
            if (error) {
                throw error;
            }
            try {
                const request = this.databaseConnection.request();
                await request.query(`
              TRUNCATE TABLE ${this.table}`);
                if (callback) {
                    return callback();
                }
                return null;
            }
            catch (err) {
                return this.errorHandler('clear', err, callback);
            }
        });
    }
}
exports.default = MSSQLStore;
