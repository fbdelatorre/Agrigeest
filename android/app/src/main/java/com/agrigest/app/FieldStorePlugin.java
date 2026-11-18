package com.agrigest.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FieldStore")
public class FieldStorePlugin extends Plugin {
    private static final String TABLE = "field_entries";
    private Store store;

    @Override
    public void load() {
        store = new Store(getContext());
    }

    @PluginMethod
    public void list(PluginCall call) {
        try (Cursor cursor = store.getReadableDatabase().query(TABLE, new String[] {"payload"},
                "scope = ?", new String[] {required(call, "scope")}, null, null, null)) {
            JSArray rows = new JSArray();
            while (cursor.moveToNext()) rows.put(cursor.getString(0));
            JSObject result = new JSObject();
            result.put("rows", rows);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read local field records", error);
        }
    }

    @PluginMethod
    public void put(PluginCall call) {
        try {
            ContentValues row = new ContentValues();
            row.put("scope", required(call, "scope"));
            row.put("id", required(call, "id"));
            row.put("state", required(call, "state"));
            row.put("parent_id", call.getString("parentId"));
            row.put("payload", required(call, "payload"));
            long written = store.getWritableDatabase().insertWithOnConflict(TABLE, null, row, SQLiteDatabase.CONFLICT_REPLACE);
            if (written == -1) throw new IllegalStateException("Field record was not written");
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not save local field record", error);
        }
    }

    @PluginMethod
    public void discard(PluginCall call) {
        try {
            String scope = required(call, "scope");
            String id = required(call, "id");
            store.getWritableDatabase().delete(TABLE,
                "scope = ? AND (id = ? OR (parent_id = ? AND state <> 'sent')) " +
                "AND EXISTS (SELECT 1 FROM field_entries AS blocked WHERE blocked.scope = ? AND blocked.id = ? AND blocked.state = 'blocked')",
                new String[] {scope, id, id, scope, id});
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not discard local field record", error);
        }
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException(key);
        return value;
    }

    private static class Store extends SQLiteOpenHelper {
        Store(Context context) {
            super(context, "agrigest-field-data.sqlite", null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE field_entries (scope TEXT NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL, " +
                       "parent_id TEXT, payload TEXT NOT NULL, PRIMARY KEY(scope, id))");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            throw new IllegalStateException("Unsupported field database upgrade");
        }
    }
}
