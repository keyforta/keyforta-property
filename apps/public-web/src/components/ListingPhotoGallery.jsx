import './ListingPhotoGallery.styles.css';
import { Tab, TabList } from '@fluentui/react-components';
import { publicListingImageRooms } from '@keyforta/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ALL_PHOTOS_TAB = 'all';

// PROP-031: renders a published listing's photo gallery grouped by room tab
// (plus an "All photos" view). `gallery.rooms` already omits any room with
// zero photos (server-side per REQ-038), so this component only ever
// renders a tab for a room that has at least one photo -- no client-side
// filtering logic is added here.
export function ListingPhotoGallery({ alt, gallery }) {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState(ALL_PHOTOS_TAB);

  const roomsPresent = publicListingImageRooms
    .map((room) => gallery.rooms.find((group) => group.room === room))
    .filter(Boolean);

  const activeGroup = roomsPresent.find((group) => group.room === selectedTab);
  const activePhotos = selectedTab === ALL_PHOTOS_TAB ? gallery.allPhotos : (activeGroup?.photos || []);

  return (
    <div className="listing-photo-gallery">
      <TabList
        aria-label={t('property_pages.gallery_tabs_label')}
        onTabSelect={(_event, data) => setSelectedTab(data.value)}
        selectedValue={selectedTab}
      >
        <Tab value={ALL_PHOTOS_TAB}>{t('property_pages.gallery_all_photos')}</Tab>
        {roomsPresent.map((group) => (
          <Tab key={group.room} value={group.room}>{t(`property_pages.gallery_room.${group.room}`)}</Tab>
        ))}
      </TabList>
      {activePhotos.length > 0 ? (
        <div className="listing-photo-grid" role="group">
          {activePhotos.map((photo) => (
            <img alt={alt} key={photo.imageId} src={photo.url} />
          ))}
        </div>
      ) : (
        <p className="listing-photo-empty">{t('property_pages.gallery_empty')}</p>
      )}
    </div>
  );
}
