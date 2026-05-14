"""
Trigger and monitor Fivetran connector sync.

This script uses the Fivetran API to trigger an initial sync and monitor
its progress until completion or timeout.
"""

import os
import sys
import time
import requests
from datetime import datetime
from dotenv import load_dotenv
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

FIVETRAN_API_KEY = os.getenv('FIVETRAN_API_KEY')
FIVETRAN_API_SECRET = os.getenv('FIVETRAN_API_SECRET')
CONNECTOR_ID = sys.argv[1] if len(sys.argv) > 1 else None

# API Configuration
FIVETRAN_API_BASE = 'https://api.fivetran.com/v1'
TIMEOUT_MINUTES = 30
POLL_INTERVAL_SECONDS = 30


def get_auth():
    """Get authentication tuple for requests."""
    return (FIVETRAN_API_KEY, FIVETRAN_API_SECRET)


def trigger_sync(connector_id):
    """Trigger a sync for the connector."""
    url = f'{FIVETRAN_API_BASE}/connectors/{connector_id}/force'
    
    logger.info(f"Triggering sync for connector {connector_id}...")
    
    try:
        response = requests.post(url, auth=get_auth())
        response.raise_for_status()
        
        data = response.json()
        logger.info("Sync triggered successfully")
        return data
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error triggering sync: {e}")
        if hasattr(e.response, 'text'):
            logger.error(f"Response: {e.response.text}")
        raise


def get_connector_status(connector_id):
    """Get current status of the connector."""
    url = f'{FIVETRAN_API_BASE}/connectors/{connector_id}'
    
    try:
        response = requests.get(url, auth=get_auth())
        response.raise_for_status()
        
        data = response.json()
        return data['data']
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error getting connector status: {e}")
        raise


def monitor_sync(connector_id, timeout_minutes=30):
    """Monitor sync progress until completion or timeout."""
    start_time = datetime.now()
    timeout_seconds = timeout_minutes * 60
    
    logger.info(f"Monitoring sync progress (timeout: {timeout_minutes} minutes)...")
    
    while True:
        elapsed = (datetime.now() - start_time).total_seconds()
        
        if elapsed > timeout_seconds:
            logger.warning(f"Sync monitoring timed out after {timeout_minutes} minutes")
            return False
        
        # Get connector status
        try:
            connector = get_connector_status(connector_id)
            
            status = connector.get('status', {})
            sync_state = status.get('sync_state', 'unknown')
            setup_state = status.get('setup_state', 'unknown')
            
            # Log current state
            logger.info(f"Status: sync_state={sync_state}, setup_state={setup_state}")
            
            # Check for completion
            if sync_state == 'scheduled':
                logger.info("Sync completed successfully!")
                return True
            
            # Check for errors
            if setup_state == 'broken':
                logger.error("Connector is in broken state")
                return False
            
            # Continue monitoring
            logger.info(f"Sync in progress... (elapsed: {int(elapsed)}s)")
            time.sleep(POLL_INTERVAL_SECONDS)
            
        except Exception as e:
            logger.error(f"Error monitoring sync: {e}")
            time.sleep(POLL_INTERVAL_SECONDS)


def get_sync_stats(connector_id):
    """Get sync statistics."""
    url = f'{FIVETRAN_API_BASE}/connectors/{connector_id}'
    
    try:
        response = requests.get(url, auth=get_auth())
        response.raise_for_status()
        
        data = response.json()['data']
        
        logger.info("\n" + "="*60)
        logger.info("SYNC STATISTICS")
        logger.info("="*60)
        
        status = data.get('status', {})
        logger.info(f"Sync State: {status.get('sync_state')}")
        logger.info(f"Setup State: {status.get('setup_state')}")
        logger.info(f"Last Sync: {status.get('update_state')}")
        logger.info(f"Schema: {data.get('schema')}")
        
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"Error getting sync stats: {e}")


def main():
    """Main execution function."""
    if not CONNECTOR_ID:
        logger.error("Connector ID not provided")
        logger.error("Usage: python trigger_fivetran_sync.py <connector_id>")
        sys.exit(1)
    
    if not FIVETRAN_API_KEY or not FIVETRAN_API_SECRET:
        logger.error("Fivetran API credentials not found in .env")
        sys.exit(1)
    
    logger.info("="*60)
    logger.info("FIVETRAN SYNC TRIGGER")
    logger.info("="*60)
    logger.info(f"Connector ID: {CONNECTOR_ID}")
    logger.info("="*60)
    
    try:
        # Trigger sync
        trigger_sync(CONNECTOR_ID)
        
        # Monitor progress
        success = monitor_sync(CONNECTOR_ID, TIMEOUT_MINUTES)
        
        # Get final stats
        get_sync_stats(CONNECTOR_ID)
        
        if success:
            logger.info("\nSync completed successfully!")
            sys.exit(0)
        else:
            logger.error("\nSync failed or timed out")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
