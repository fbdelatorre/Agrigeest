/*
  # Add season status management

  1. Changes
    - Add function to update season status
    - Add function to ensure only one active season
*/

-- Create function to update season status
CREATE OR REPLACE FUNCTION update_season_status(
  season_id_param uuid,
  new_status text
) RETURNS void AS $$
BEGIN
  -- If setting a season to active, deactivate all other seasons first
  IF new_status = 'active' THEN
    UPDATE seasons
    SET status = 'completed'
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND id != season_id_param;
  END IF;

  -- Update the target season's status
  UPDATE seasons
  SET 
    status = new_status,
    updated_at = now()
  WHERE id = season_id_param
    AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;