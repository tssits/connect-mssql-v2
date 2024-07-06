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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-shadow */
const mssql_1 = __importDefault(require("mssql"));
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const store_1 = __importDefault(require("../src/store"));
dotenv.config({ path: path.resolve(__dirname, '.env') });
const TESTDATA = {
    somevalue: 'yes',
    somenumber: 123,
    cookie: { expires: new Date(), originalMaxAge: 10000 },
};
const MODIFIEDDATA = {
    somevalue: 'no',
    somenumber: 456,
    cookie: { expires: new Date(), originalMaxAge: 10000 },
};
const TOUCHED = { cookie: { expires: new Date(), originalMaxAge: 10000 } };
const sqlConfig = {
    user: process.env.SQLUSER,
    password: process.env.SQLPASSWORD,
    server: process.env.SQLSERVER,
    database: process.env.SQLDATABASE,
};
beforeAll(async () => {
    const db = new mssql_1.default.ConnectionPool(sqlConfig);
    await db.connect();
    const request = db.request();
    await request.query('DELETE FROM dbo.Sessions');
    await db.close();
});
describe('connect-mssql-v2', () => {
    describe('Basic test suite', () => {
        const store = new store_1.default(sqlConfig, {
            table: 'Sessions',
        });
        test('Should not find a session', (done) => {
            store.get('1234ABC', (err, session) => {
                if (err)
                    return done(err);
                expect(session).toBeFalsy();
                return done();
            });
        });
        test('Should create a new session', (done) => {
            store.set('1234ABC', TESTDATA, done);
        });
        test('Should get created session', (done) => {
            store.get('1234ABC', (err, session) => {
                if (err)
                    return done(err);
                expect(session).toBeTruthy();
                expect(session.somevalue).toEqual(TESTDATA.somevalue);
                expect(session.somenumber).toEqual(TESTDATA.somenumber);
                expect(session.cookie.expires).toEqual(TESTDATA.cookie.expires.toISOString());
                return done();
            });
        });
        test('Should modify session', (done) => {
            store.set('1234ABC', MODIFIEDDATA, done);
        });
        test('Should get modified session', (done) => {
            store.get('1234ABC', (err, session) => {
                if (err)
                    return done(err);
                expect(session).toBeTruthy();
                expect(session.somevalue).toEqual(MODIFIEDDATA.somevalue);
                expect(session.somenumber).toEqual(MODIFIEDDATA.somenumber);
                expect(session.cookie.expires).toEqual(MODIFIEDDATA.cookie.expires.toISOString());
                return done();
            });
        });
        test('Should touch session', (done) => {
            store.touch('1234ABC', TOUCHED, done);
        });
        test('Should get touched session', (done) => {
            store.get('1234ABC', (err, session) => {
                if (err)
                    return done(err);
                expect(session).toBeTruthy();
                expect(session.cookie.expires).toEqual(TOUCHED.cookie.expires.toISOString());
                return done();
            });
        });
        test('Should get all existing sessions', async (done) => {
            await store.set('5678DEF', TESTDATA, done);
            store.all((err, session) => {
                if (err)
                    return done(err);
                expect(Object.keys(session)).toHaveLength(2);
                expect(session['5678DEF'].somevalue).toBe('yes');
                store.destroy('5678DEF');
                return done();
            });
        });
        test('Should remove created session', (done) => {
            store.destroy('1234ABC', done);
        });
        test('Should have no sessions in the database', (done) => {
            store.length((err, length) => {
                if (err)
                    return done(err);
                expect(length).toBe(0);
                return done();
            });
        });
    });
    describe('autoRemove test suite', () => {
        let cbed = false;
        const cb = () => {
            cbed = true;
        };
        const store = new store_1.default(sqlConfig, {
            table: 'Sessions',
            autoRemove: true,
            autoRemoveCallback: cb,
        });
        test('Should destroy all sessions', (done) => {
            /* eslint-disable no-shadow */
            setTimeout(() => {
                store.set('a', {
                    cookie: {
                        expires: new Date(Date.now() - 60000),
                        originalMaxAge: 1000,
                    },
                }, (err) => {
                    if (err) {
                        return done(err);
                    }
                    return store.set('b', {
                        cookie: {
                            expires: new Date(Date.now() - 60000),
                            originalMaxAge: 1000,
                        },
                    }, (err) => {
                        if (err) {
                            return done(err);
                        }
                        return store.length((err, length) => {
                            if (err) {
                                return done(err);
                            }
                            expect(length).toBe(2);
                            return store.destroyExpired((err) => {
                                if (err) {
                                    return done(err);
                                }
                                return store.length((err, length) => {
                                    if (err) {
                                        return done(err);
                                    }
                                    expect(length).toBe(0);
                                    expect(cbed).toBeTruthy();
                                    return done();
                                });
                            });
                        });
                    });
                });
            }, 1000);
            /* eslint-enable no-shadow */
        });
    });
    describe('errors test suite', () => {
        const store = new store_1.default(sqlConfig, {
            table: 'Sessions',
        });
        test('Should wait for connection establishment', (done) => {
            store.get('asdf', done);
        });
        test('Should report error when connection is closed', (done) => {
            store.databaseConnection.close();
            store.get('asdf', (err) => {
                expect(err).toBeTruthy();
                return done();
            });
        });
    });
    describe('emitters test suite', () => {
        test('Should emit a connect listener', (done) => {
            const store = new store_1.default(sqlConfig, {
                table: 'Sessions',
            });
            store.get('abcd', (err) => err);
            store.on('connect', (connected) => {
                // eslint-disable-next-line no-underscore-dangle
                expect(connected.databaseConnection._connected).toBeTruthy();
                return done();
            });
        });
        describe('sessionError Listener', () => {
            test('Should emit sessionError (errorHandler called directly)', (done) => {
                const store = new store_1.default(sqlConfig, {
                    table: 'Sessions',
                });
                store.on('sessionError', (error, method) => {
                    expect(method).toEqual('test');
                    expect(error).toBeInstanceOf(Error);
                    done();
                });
                const errorHandler = store.errorHandler('test', new Error('Test errorHandler'), () => true);
                expect(errorHandler).toBeTruthy();
            });
            test('Should emit sessionError (errorHandler called directly, NO CB)', (done) => {
                const store = new store_1.default(sqlConfig, {
                    table: 'Sessions',
                });
                store.on('sessionError', (error, method) => {
                    expect(method).toEqual('test');
                    expect(error).toBeInstanceOf(Error);
                    done();
                });
                const errorHandler = store.errorHandler('test', new Error('Test errorHandler'));
                expect(errorHandler).toBeFalsy();
            });
        });
        test('Should emit an error listener', (done) => {
            const localConfig = {
                user: process.env.SQLUSER,
                password: 'noGoodPassword',
                server: process.env.SQLSERVER,
                database: process.env.SQLDATABASE,
            };
            const store = new store_1.default(localConfig, {
                table: 'Sessions',
            });
            store.get('abcd', (err) => err);
            store.on('error', (error) => {
                expect(error.name).toEqual('ConnectionError');
                expect(error.originalError.message).toEqual(expect.stringContaining('Login failed'));
                return done();
            });
        });
    });
});
