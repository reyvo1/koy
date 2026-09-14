# Target Repository Structure

This is a target, not permission to rewrite an existing repository
blindly.

    /
      AI-Development-Kit/
      apps/
        api/
        worker/
        admin/
        mobile/
      packages/
        config/
        database/
        contracts/
        logger/
        testing/
      firmware/
        esp32-sdk/
      infrastructure/
        docker/
        deployment/
      docs/
        adr/

The agent must inspect actual repository first. If repository already
has a coherent structure, preserve it unless a migration is explicitly
approved.
