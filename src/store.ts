import sql, {
  config as SQLConfig,
  NVarChar,
  MAX,
  DateTime,
  ConnectionPool,
  ConnectionError
} from 'mssql';

interface StoreOptions {
  table?: string;
  ttl?: number;
  autoRemove?: boolean;
  autoRemoveInterval?: number;
  autoRemoveCallback?: (props: any) => any;
  useUTC?: boolean;
}
type Errors = ConnectionError | null;
type GetCallback = (
  error: Errors,
  session?: Express.SessionData | null
) => void;
type LengthCallback = (error: Errors, length?: number) => void;
type CommonCallback = (args?: any[] | null) => void;
type ReadyCallback = (err: Errors, cb?: any) => Promise<any>;

const Store = (session: any) => {
  const Store = session.Store || session.session.Store;
  class MSSQLStore extends Store {
    table: string;
    ttl: number;
    autoRemove: boolean;
    autoRemoveInterval: number;
    autoRemoveCallback?: (props?: any) => any;
    useUTC: boolean;
    config: SQLConfig;
    databaseConnection: ConnectionPool | null;

    constructor(config: SQLConfig, options?: StoreOptions) {
      super();
      this.table = (options && options.table) || 'sessions';
      this.ttl = (options && options.ttl) || 1000 * 60 * 60 * 24;
      this.autoRemove = (options && options.autoRemove) || false;
      this.autoRemoveInterval =
        (options && options.autoRemoveInterval) || 1000 * 60 * 10;
      this.autoRemoveCallback =
        (options && options.autoRemoveCallback) || undefined;
      this.useUTC = (options && options.useUTC) || true;
      this.config = config;
      this.databaseConnection = null;
    }

    async initializeDatabase() {
      try {
        this.databaseConnection = new sql.ConnectionPool(this.config);
        await this.databaseConnection.connect();

        if (this.autoRemove) {
          setInterval(this.destroyExpired.bind(this), this.autoRemoveInterval);
        }
      } catch (error) {
        console.error(error);
        throw error;
      }
    }
    private async ready(callback: ReadyCallback) {
      await this.initializeDatabase();
      if (this.databaseConnection && this.databaseConnection.connected) {
        return callback.call(this, null, null);
      }
      if (this.databaseConnection && this.databaseConnection.connecting) {
        return this.databaseConnection.once('connect', callback.bind(this));
      }
      callback.call(
        this,
        new Error('Connection is closed.') as ConnectionError
      );
    }
    //////////////////////////////////////////////////////////////////
    // Attempt to fetch session the given sid
    /**
     * @param sid
     * @param callback
     */
    ////////////////////////////////////////////////////////////////
    get(sid: string, callback: GetCallback) {
      this.ready(async (err: Errors) => {
        if (err) {
          throw err;
        }

        try {
          const request = (this.databaseConnection as ConnectionPool).request();
          const result = await request.input('sid', NVarChar(255), sid).query(`
              SELECT session FROM ${this.table} WHERE sid = @sid`);

          if (result.recordset.length) {
            return callback(null, JSON.parse(result.recordset[0].session));
          }

          return callback(null, null);
        } catch (error) {
          return callback(error);
        }
      });
    }
    //////////////////////////////////////////////////////////////////
    // Commit the given session object associated
    // with the given sid
    /**
     *
     * @param sid
     * @param data
     * @param callback
     */
    ////////////////////////////////////////////////////////////////
    set(sid: string, data: any, callback: CommonCallback) {
      this.ready(async (err: Errors) => {
        if (err) {
          throw err;
        }

        try {
          const expires = new Date(
            (data.cookie && data.cookie.expires) || Date.now() + this.ttl
          );
          const request = (this.databaseConnection as ConnectionPool).request();
          await request
            .input('sid', NVarChar(255), sid)
            .input('session', NVarChar(MAX), JSON.stringify(data))
            .input('expires', DateTime, expires).query(`
              UPDATE ${this.table} 
                SET session = @session, expires = @expires 
                WHERE sid = @sid;
                IF @@ROWCOUNT = 0 
                  BEGIN
                    INSERT INTO ${this.table} (sid, session, expires)
                      VALUES (@sid, @session, @expires)
                  END;`);

          return callback();
        } catch (error) {
          return callback(error);
        }
      });
    }
    //////////////////////////////////////////////////////////////////
    // Update the expiration date of the given sid
    /**
     *
     * @param sid
     * @param data
     * @param callback
     */
    ////////////////////////////////////////////////////////////////
    touch(
      sid: string,
      data: { cookie: { expires: Date } },
      callback: CommonCallback
    ) {
      this.ready(async (err: Errors) => {
        if (err) {
          throw err;
        }

        try {
          const expires = new Date(
            (data.cookie && data.cookie.expires) || Date.now() + this.ttl
          );
          const request = (this.databaseConnection as ConnectionPool).request();
          await request
            .input('sid', NVarChar(255), sid)
            .input('expires', DateTime, expires).query(`
              UPDATE ${this.table} 
                SET expires = @expires 
              WHERE sid = @sid`);

          return callback();
        } catch (error) {
          return callback(error);
        }
      });
    }
    //////////////////////////////////////////////////////////////////
    // Destroy the session associated with the given sid
    /**
     *
     * @param sid
     * @param callback
     */
    ////////////////////////////////////////////////////////////////
    destroy(sid: string, callback: CommonCallback) {
      this.ready(async (err: Errors) => {
        if (err) {
          throw err;
        }

        try {
          const request = (this.databaseConnection as ConnectionPool).request();
          await request.input('sid', NVarChar(255), sid).query(`
              DELETE FROM ${this.table} 
              WHERE sid = @sid`);

          return callback();
        } catch (error) {
          return callback(error);
        }
      });
    }
    //////////////////////////////////////////////////////////////////
    // Destroy expired sessions
    ////////////////////////////////////////////////////////////////
    destroyExpired(callback: CommonCallback) {
      this.ready(async (err: Errors) => {
        if (err) {
          throw err;
        }

        try {
          const request = (this.databaseConnection as ConnectionPool).request();
          await request.query(`
              DELETE FROM ${this.table} 
              WHERE expires <= GET${this.useUTC ? 'UTC' : ''}DATE()`);

          return this.autoRemoveCallback
            ? this.autoRemoveCallback()
            : callback();
        } catch (error) {
          return this.autoRemoveCallback
            ? this.autoRemoveCallback(err)
            : callback(err);
        }
      });
    }
    //////////////////////////////////////////////////////////////////
    // Fetch number of sessions
    /**
     * @param callback
     */
    ////////////////////////////////////////////////////////////////
    length(callback: LengthCallback) {
      this.ready(async (err: Errors) => {
        if (err) {
          throw err;
        }

        try {
          const request = (this.databaseConnection as ConnectionPool).request();
          const result = await request.query(`
              SELECT COUNT(sid) AS length
              FROM ${this.table}`);

          return callback(null, result.recordset[0].length);
        } catch (error) {
          return callback(error);
        }
      });
    }
    //////////////////////////////////////////////////////////////////
    // Clear all sessions
    /**
     * @param callback
     */
    ////////////////////////////////////////////////////////////////
    clear(callback: CommonCallback) {
      this.ready(async (err: Errors) => {
        if (err) {
          throw err;
        }

        try {
          const request = (this.databaseConnection as ConnectionPool).request();
          await request.query(`
              TRUNCATE TABLE ${this.table}`);

          return callback();
        } catch (error) {
          return callback(error);
        }
      });
    }
  }
  return MSSQLStore;
};

export default Store;
