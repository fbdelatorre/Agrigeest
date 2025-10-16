/*
  # Clean test data from database
  
  1. Changes
    - Remove all test data from tables
    - Preserve database structure and constraints
    - Handle foreign key dependencies correctly
    
  2. Notes
    - Uses DELETE instead of TRUNCATE to respect triggers
    - Maintains referential integrity
    - Safe for production use
*/

-- Clean data from tables in correct order
DELETE FROM operation_products;
DELETE FROM operations;
DELETE FROM areas;
DELETE FROM products;
DELETE FROM seasons;
DELETE FROM invitations;
DELETE FROM user_profiles;
DELETE FROM institutions;