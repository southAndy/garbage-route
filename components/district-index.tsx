import Link from "next/link";
import { cities, cityPath, districtPath, getDistricts } from "@/lib/repository";

export default function DistrictIndex({ heading = "瀏覽所有行政區" }: { heading?: string }) {
  return (
    <section className="district-index" aria-labelledby="district-index-title">
      <p className="eyebrow">BROWSE BY DISTRICT</p>
      <h2 id="district-index-title">{heading}</h2>
      <div className="district-index-grid">
        {cities.map((city) => (
          <div key={city.code}>
            <h3><Link href={cityPath(city.code)}>{city.name}垃圾車路線</Link></h3>
            <ul>
              {getDistricts(city.code).map((district) => (
                <li key={district.slug}><Link href={districtPath(city.code, district.slug)}>{district.name}<small>{district.routeCount} 條</small></Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
