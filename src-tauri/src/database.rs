use rusqlite::{Connection, Result, params, OptionalExtension};
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileVersion {
    pub id: String,
    pub portfolio_name: String,
    pub report_date: String,
    pub original_filename: String,
    pub version_filename: String,
    pub file_path: String,
    pub file_size: i64,
    pub upload_timestamp: DateTime<Utc>,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FunderUpload {
    pub id: String,
    pub portfolio_name: String,
    pub funder_name: String,
    pub report_date: String,
    pub upload_type: String, // "weekly" or "monthly"
    pub original_filename: String,
    pub stored_filename: String,
    pub file_path: String,
    pub file_size: i64,
    pub upload_timestamp: DateTime<Utc>,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: &PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS file_versions (
                id TEXT PRIMARY KEY,
                portfolio_name TEXT NOT NULL,
                report_date TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                version_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                upload_timestamp TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 0
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_portfolio_date 
             ON file_versions(portfolio_name, report_date)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_report_date 
             ON file_versions(report_date)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_active 
             ON file_versions(is_active)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS funder_uploads (
                id TEXT PRIMARY KEY,
                portfolio_name TEXT NOT NULL,
                funder_name TEXT NOT NULL,
                report_date TEXT NOT NULL,
                upload_type TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                upload_timestamp TEXT NOT NULL,
                UNIQUE(portfolio_name, funder_name, report_date, upload_type)
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_funder_portfolio_date 
             ON funder_uploads(portfolio_name, funder_name, report_date)",
            [],
        )?;

        Ok(Database { conn })
    }
    
    pub fn insert_file_version(&self, version: &FileVersion) -> Result<()> {
        self.conn.execute(
            "UPDATE file_versions SET is_active = 0 
             WHERE portfolio_name = ?1 AND is_active = 1",
            params![version.portfolio_name],
        )?;
        
        self.conn.execute(
            "INSERT INTO file_versions 
             (id, portfolio_name, report_date, original_filename, version_filename, 
              file_path, file_size, upload_timestamp, is_active) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                version.id,
                version.portfolio_name,
                version.report_date,
                version.original_filename,
                version.version_filename,
                version.file_path,
                version.file_size,
                version.upload_timestamp.to_rfc3339(),
                version.is_active,
            ],
        )?;
        Ok(())
    }
    
    pub fn get_version_by_id(&self, id: &str) -> Result<Option<FileVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, report_date, original_filename, version_filename, 
                    file_path, file_size, upload_timestamp, is_active 
             FROM file_versions 
             WHERE id = ?1"
        )?;
        
        let version = stmt.query_row(params![id], |row| {
            Ok(FileVersion {
                id: row.get(0)?,
                portfolio_name: row.get(1)?,
                report_date: row.get(2)?,
                original_filename: row.get(3)?,
                version_filename: row.get(4)?,
                file_path: row.get(5)?,
                file_size: row.get(6)?,
                upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .unwrap()
                    .with_timezone(&Utc),
                is_active: row.get(8)?,
            })
        }).optional()?;
        
        Ok(version)
    }
    
    pub fn get_active_version(&self, portfolio_name: &str) -> Result<Option<FileVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, report_date, original_filename, version_filename, 
                    file_path, file_size, upload_timestamp, is_active 
             FROM file_versions 
             WHERE portfolio_name = ?1 AND is_active = 1"
        )?;
        
        let version = stmt.query_row(params![portfolio_name], |row| {
            Ok(FileVersion {
                id: row.get(0)?,
                portfolio_name: row.get(1)?,
                report_date: row.get(2)?,
                original_filename: row.get(3)?,
                version_filename: row.get(4)?,
                file_path: row.get(5)?,
                file_size: row.get(6)?,
                upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .unwrap()
                    .with_timezone(&Utc),
                is_active: row.get(8)?,
            })
        }).optional()?;
        
        Ok(version)
    }
    
    pub fn get_versions_by_portfolio(&self, portfolio_name: &str) -> Result<Vec<FileVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, report_date, original_filename, version_filename, 
                    file_path, file_size, upload_timestamp, is_active 
             FROM file_versions 
             WHERE portfolio_name = ?1 
             ORDER BY report_date DESC, upload_timestamp DESC"
        )?;
        
        let versions = stmt.query_map(params![portfolio_name], |row| {
            Ok(FileVersion {
                id: row.get(0)?,
                portfolio_name: row.get(1)?,
                report_date: row.get(2)?,
                original_filename: row.get(3)?,
                version_filename: row.get(4)?,
                file_path: row.get(5)?,
                file_size: row.get(6)?,
                upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .unwrap()
                    .with_timezone(&Utc),
                is_active: row.get(8)?,
            })
        })?;
        
        versions.collect()
    }
    
    pub fn get_versions_by_date(&self, report_date: &str) -> Result<Vec<FileVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, report_date, original_filename, version_filename, 
                    file_path, file_size, upload_timestamp, is_active 
             FROM file_versions 
             WHERE report_date = ?1 
             ORDER BY portfolio_name, upload_timestamp DESC"
        )?;
        
        let versions = stmt.query_map(params![report_date], |row| {
            Ok(FileVersion {
                id: row.get(0)?,
                portfolio_name: row.get(1)?,
                report_date: row.get(2)?,
                original_filename: row.get(3)?,
                version_filename: row.get(4)?,
                file_path: row.get(5)?,
                file_size: row.get(6)?,
                upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .unwrap()
                    .with_timezone(&Utc),
                is_active: row.get(8)?,
            })
        })?;
        
        versions.collect()
    }
    
    pub fn get_version_by_portfolio_and_date(
        &self, 
        portfolio_name: &str, 
        report_date: &str
    ) -> Result<Option<FileVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, report_date, original_filename, version_filename, 
                    file_path, file_size, upload_timestamp, is_active 
             FROM file_versions 
             WHERE portfolio_name = ?1 AND report_date = ?2
             ORDER BY upload_timestamp DESC
             LIMIT 1"
        )?;
        
        let version = stmt.query_row(params![portfolio_name, report_date], |row| {
            Ok(FileVersion {
                id: row.get(0)?,
                portfolio_name: row.get(1)?,
                report_date: row.get(2)?,
                original_filename: row.get(3)?,
                version_filename: row.get(4)?,
                file_path: row.get(5)?,
                file_size: row.get(6)?,
                upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .unwrap()
                    .with_timezone(&Utc),
                is_active: row.get(8)?,
            })
        }).optional()?;
        
        Ok(version)
    }
    
    pub fn delete_version(&self, id: &str) -> Result<bool> {
        let rows_affected = self.conn.execute(
            "DELETE FROM file_versions WHERE id = ?1",
            params![id],
        )?;
        Ok(rows_affected > 0)
    }
    
    pub fn set_active_version(&self, id: &str) -> Result<()> {
        let version = self.get_version_by_id(id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        
        self.conn.execute(
            "UPDATE file_versions SET is_active = 0 
             WHERE portfolio_name = ?1 AND is_active = 1",
            params![version.portfolio_name],
        )?;
        
        self.conn.execute(
            "UPDATE file_versions SET is_active = 1 WHERE id = ?1",
            params![id],
        )?;
        
        Ok(())
    }
    
    pub fn get_all_versions(&self) -> Result<Vec<FileVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, report_date, original_filename, version_filename, 
                    file_path, file_size, upload_timestamp, is_active 
             FROM file_versions 
             ORDER BY report_date DESC, portfolio_name, upload_timestamp DESC"
        )?;
        
        let versions = stmt.query_map([], |row| {
            Ok(FileVersion {
                id: row.get(0)?,
                portfolio_name: row.get(1)?,
                report_date: row.get(2)?,
                original_filename: row.get(3)?,
                version_filename: row.get(4)?,
                file_path: row.get(5)?,
                file_size: row.get(6)?,
                upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .unwrap()
                    .with_timezone(&Utc),
                is_active: row.get(8)?,
            })
        })?;
        
        versions.collect()
    }
    
    // Funder Upload Methods
    pub fn insert_funder_upload(&self, upload: &FunderUpload) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO funder_uploads 
             (id, portfolio_name, funder_name, report_date, upload_type,
              original_filename, stored_filename, file_path, file_size, upload_timestamp) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                upload.id,
                upload.portfolio_name,
                upload.funder_name,
                upload.report_date,
                upload.upload_type,
                upload.original_filename,
                upload.stored_filename,
                upload.file_path,
                upload.file_size,
                upload.upload_timestamp.to_rfc3339(),
            ],
        )?;
        Ok(())
    }
    
    pub fn get_funder_upload(
        &self,
        portfolio_name: &str,
        funder_name: &str,
        report_date: &str,
        upload_type: &str,
    ) -> Result<Option<FunderUpload>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, funder_name, report_date, upload_type,
                    original_filename, stored_filename, file_path, file_size, upload_timestamp 
             FROM funder_uploads 
             WHERE portfolio_name = ?1 AND funder_name = ?2 AND report_date = ?3 AND upload_type = ?4"
        )?;
        
        let upload = stmt.query_row(
            params![portfolio_name, funder_name, report_date, upload_type], 
            |row| {
                Ok(FunderUpload {
                    id: row.get(0)?,
                    portfolio_name: row.get(1)?,
                    funder_name: row.get(2)?,
                    report_date: row.get(3)?,
                    upload_type: row.get(4)?,
                    original_filename: row.get(5)?,
                    stored_filename: row.get(6)?,
                    file_path: row.get(7)?,
                    file_size: row.get(8)?,
                    upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            }
        ).optional()?;
        
        Ok(upload)
    }
    
    pub fn get_funder_uploads_by_portfolio_and_date(
        &self,
        portfolio_name: &str,
        report_date: &str,
    ) -> Result<Vec<FunderUpload>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, portfolio_name, funder_name, report_date, upload_type,
                    original_filename, stored_filename, file_path, file_size, upload_timestamp 
             FROM funder_uploads 
             WHERE portfolio_name = ?1 AND report_date = ?2 
             ORDER BY upload_type, funder_name"
        )?;
        
        let uploads = stmt.query_map(params![portfolio_name, report_date], |row| {
            Ok(FunderUpload {
                id: row.get(0)?,
                portfolio_name: row.get(1)?,
                funder_name: row.get(2)?,
                report_date: row.get(3)?,
                upload_type: row.get(4)?,
                original_filename: row.get(5)?,
                stored_filename: row.get(6)?,
                file_path: row.get(7)?,
                file_size: row.get(8)?,
                upload_timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                    .unwrap()
                    .with_timezone(&Utc),
            })
        })?;
        
        uploads.collect()
    }
    
    pub fn delete_funder_upload(&self, id: &str) -> Result<bool> {
        let rows_affected = self.conn.execute(
            "DELETE FROM funder_uploads WHERE id = ?1",
            params![id],
        )?;
        Ok(rows_affected > 0)
    }
}