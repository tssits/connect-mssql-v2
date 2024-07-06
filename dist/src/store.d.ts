import { config as SQLConfig, ConnectionPool } from 'mssql';
import { SessionData, Store as ExpressSessionStore } from 'express-session';
export interface StoreOptions {
    /**
       * Table to use as session store. Default: `[sessions]`
       */
    table?: string;
    /**
       * (Time To Live) Determines the expiration date. Default: `1000 * 60 * 60 * 24` (24 hours)
       */
    ttl?: number;
    /**
       * Determines if expired sessions should be autoremoved or not.
       * If value is `true` then a new function, `destroyExpired()`,
       * will autodelete expired sessions on a set interval. Default: `false`
       */
    autoRemove?: boolean;
    /**
       * Sets the timer interval for each call to `destroyExpired()`.
       * Default: `1000 * 60 * 10` (10 min)
       */
    autoRemoveInterval?: number;
    /**
       * Is the callback function for `destroyExpired()`. Default: `undefined`
       */
    autoRemoveCallback?: (props: any) => any;
    /**
       * Determines if we are to use the `GETUTCDATE` instead of `GETDATE` Default: `true`
       */
    useUTC?: boolean;
}
export interface IMSSQLStore {
    config: SQLConfig;
    options?: StoreOptions;
    databaseConnection: ConnectionPool | null;
    all(callback: (err: any, session?: {
        [sid: string]: SessionData;
    } | null) => void): void;
    get(sid: string, callback: (err: any, session?: SessionData | null) => void): void;
    set(sid: string, session: SessionData, callback?: (err?: any) => void): void;
    touch(sid: string, session: SessionData, callback?: (err?: any) => void): void;
    destroy(sid: string, callback?: (err?: any) => void): void;
    destroyExpired(callback?: Function): void;
    length(callback: (err: any, length?: number | null) => void): void;
    clear(callback?: (err?: any) => void): void;
}
declare class MSSQLStore extends ExpressSessionStore implements IMSSQLStore {
    table: string;
    ttl: number;
    autoRemove: boolean;
    autoRemoveInterval: number;
    autoRemoveCallback?: (props?: any) => any;
    useUTC: boolean;
    config: SQLConfig;
    databaseConnection: ConnectionPool;
    constructor(config: SQLConfig, options?: StoreOptions);
    private initializeDatabase;
    private ready;
    /**
     * Attachs sessionError event listener and emits on error on any
     * store error and includes method where error occured
     * @param method
     * @param error
     * @param callback
     */
    errorHandler(method: keyof IMSSQLStore, error: any, callback?: any): any;
    /**
     * Attempt to fetch all sessions
     * @param callback
     */
    all(callback: (err: any, session?: {
        [sid: string]: SessionData;
    } | null) => void): void;
    /**
     * Attempt to fetch session the given sid
     * @param sid
     * @param callback
     */
    get(sid: string, callback: (err: any, session?: SessionData | null) => void): void;
    /**
     * Commit the given session object associated with the given sid
     * @param sid
     * @param session
     * @param callback
     */
    set(sid: string, session: SessionData, callback?: (err?: any) => void): void;
    /**
     * Update the expiration date of the given sid
     * @param sid
     * @param data
     * @param callback
     */
    touch(sid: string, session: SessionData, callback: (err?: any) => void): void;
    /**
     * Destroy the session associated with the given sid
     * @param sid
     * @param callback
     */
    destroy(sid: string, callback?: (err?: any) => void): void;
    /**
     * Destroy expired sessions
     * @param callback
     */
    destroyExpired(callback: any): void;
    /**
     * Fetch total number of sessions
     * @param callback
     */
    length(callback: (err: any, length: number) => void): void;
    /**
     * Clear all sessions
     * @param callback
     */
    clear(callback: (err?: any) => void): void;
}
export default MSSQLStore;
