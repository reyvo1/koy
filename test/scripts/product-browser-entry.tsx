import React from 'react';
import { createRoot } from 'react-dom/client';
import { CameraPlayer } from '../../packages/design-system/src/camera-player';
import { CapabilityControl } from '../../apps/user-web/components/capability-control';
import { DeviceRoutinesPanel } from '../../apps/user-web/components/device-routines-panel';
import { DeviceLocationEditor } from '../../apps/admin-web/components/device-location-editor';
import { GeoMap } from '../../packages/design-system/src/geo-map';
const capability = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  key: 'level',
  dataType: 'number',
  semanticType: 'level',
  unit: '%',
  constraints: { min: 0, max: 100, precision: 1 },
  isWritable: true,
  isReadable: true,
  isReportable: true,
  schemaVersion: '1.0.0',
};
createRoot(document.getElementById('root')!).render(
  <main>
    <h1>
      Product browser fixture — synthetic media / simulated domain responses
    </h1>
    <section id="typed">
      <CapabilityControl
        capability={capability}
        busy={false}
        onSend={async (value) => {
          await fetch('/fixture-command', {
            method: 'POST',
            body: JSON.stringify({ value }),
          });
        }}
      />
    </section>
    <section id="location">
      <GeoMap
        locations={[
          {
            id: 'fixture-location',
            deviceId: 'camera',
            deviceName: 'Fixture zero',
            latitude: 0,
            longitude: 0,
            label: 'Fixture zero',
            recordedAt: new Date().toISOString(),
          },
        ]}
      />
    </section>
    <DeviceLocationEditor deviceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" />
    <CameraPlayer deviceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" />
    <DeviceRoutinesPanel
      deviceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      capabilities={[capability]}
      canControl
    />
  </main>,
);
