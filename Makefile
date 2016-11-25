DIR = /Volumes/oeil/gis/data/usa/census/2014

.PHONY: all
all: main.js data/results.csv data/counties.json

SRC = $(filter-out js/script.js,$(wildcard js/*.js))

main.js: js/script.js $(SRC) rollup.js .babelrc
	rollup -c rollup.js -f iife -n stateGenerator -g d3:d3 $< -o $@

data/counties.json: geo/counties.geojson | data
	geo2topo -q 1e5 counties=$< | \
	toposimplify -fp 6 -o $@

geo/counties.geojson: geo/counties.shp $(foreach x,90 00 10,dbf/DEC_$x.dbf)
	ogr2ogr /dev/stdout $< -f GeoJSON -dialect sqlite \
		-sql "SELECT Geometry, GEOID id, a.NAME n, CAST(dec90.P01 as INTEGER) AS '90', \
			CAST(dec00.P01 as INTEGER) AS '00', CAST(dec10.P01 as INTEGER) AS '10' \
			FROM counties a \
			LEFT JOIN 'dbf'.DEC_90 AS dec90 USING (GEOID) \
			LEFT JOIN 'dbf'.DEC_00 AS dec00 USING (GEOID) \
			LEFT JOIN 'dbf'.DEC_10 AS dec10 USING (GEOID)" | \
	geoproject -o $@ 'd3.geoAlbersUsa().scale(1900).translate([750, 500])'

data/results.csv: $(foreach x,00 04 08 12 16,dbf/20$(x).dbf) | data
	ogr2ogr -f CSV $@ $(<D) -dialect sqlite \
		-sql 'SELECT a.*, b.r12, b.d12, b.tot12, c.r08, c.d08, c.tot08, \
		d.r04, d.d04, d.tot04, e.r00, e.d00, e.tot00 \
		FROM "2016" a \
		LEFT JOIN "2012" b USING (GEOID) LEFT JOIN "2008" c USING (GEOID) \
		LEFT JOIN "2004" d USING (GEOID) LEFT JOIN "2000" e USING (GEOID) \
		WHERE GEOID NOT IN ("46113", "51515")'

dbf/2016.dbf: results/2016.csv | dbf
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $< -select GEOID,NAME,tot16,r16,d16 -where "GEOID != '02000'"
	@rm -f $(basename $@).qix
	ogrinfo $(@D) -sql 'CREATE INDEX ON "2016" USING GEOID'

dbf/2012.dbf: results/2012.csv | dbf
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $< -overwrite -dialect sqlite -sql "SELECT GEOID, CAST(Romney as INTEGER) r12, CAST(Obama as INTEGER) d12, CAST(total as INTEGER) tot12 \
        FROM \"2012\" WHERE GEOID NOT LIKE '15%'"
	ogr2ogr $@ $< -append -update -dialect sqlite \
        -sql "SELECT '15' GEOID, \
        SUM(CAST(Romney as INTEGER)) r12, \
        SUM(CAST(Obama as INTEGER)) d12, \
        SUM(CAST(total as INTEGER)) tot12 \
        FROM \"2012\" WHERE SUBSTR(GEOID, 1, 2) = '15'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2012\" SET GEOID='46102' WHERE GEOID='46113'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2012\" SET \
		r12 = (SELECT SUM(r12) FROM \"2012\" WHERE GEOID IN ('51515', '51019')), \
		d12 = (SELECT SUM(d12) FROM \"2012\" WHERE GEOID IN ('51515', '51019')), \
		tot12 = (SELECT SUM(tot12) FROM \"2012\" WHERE GEOID IN ('51515', '51019')) \
		WHERE GEOID = '51019'"
	ogrinfo $(@D) -sql 'CREATE INDEX ON "2012" USING GEOID'

dbf/2008.dbf: results/2008.csv | dbf
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $< -overwrite -dialect sqlite -sql "SELECT GEOID, CAST(VOTE_REP as INTEGER) r08, CAST(VOTE_DEM as INTEGER) d08, CAST(TOTAL_VOTE as INTEGER) tot08 \
        FROM \"2008\" WHERE STATE NOT IN ('AK', 'HI')"
	ogr2ogr $@ $< -append -update -dialect sqlite \
        -sql "SELECT CASE STATE WHEN 'HI' THEN '15' ELSE '02' END GEOID, \
        SUM(CAST(VOTE_REP as INTEGER)) r08, \
        SUM(CAST(VOTE_DEM as INTEGER)) d08, \
        SUM(CAST(TOTAL_VOTE as INTEGER)) tot08 \
        FROM \"2008\" WHERE STATE IN ('AK', 'HI') GROUP BY STATE"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2008\" SET GEOID = '46102' WHERE GEOID = '46113'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2008\" SET \
		r08 = (SELECT SUM(r08) FROM \"2008\" WHERE GEOID IN ('51515', '51019')), \
		d08 = (SELECT SUM(d08) FROM \"2008\" WHERE GEOID IN ('51515', '51019')), \
		tot08 = (SELECT SUM(tot08) FROM \"2008\" WHERE GEOID IN ('51515', '51019')) \
		WHERE GEOID = '51019'"
	ogrinfo $(@D) -sql 'CREATE INDEX ON "2008" USING GEOID'

dbf/2004.dbf: results/2004.csv | dbf
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $< -dialect sqlite -sql "SELECT FIPS GEOID, CAST(VOTE_REP as INTEGER) r04, CAST(VOTE_DEM as INTEGER) d04, CAST(TOTAL_VOTE as INTEGER) tot04 \
		FROM \"2004\" WHERE FIPS NOT LIKE '02%' AND FIPS NOT LIKE '15%'"
	ogr2ogr $@ $< -append -update -dialect sqlite \
		-sql "SELECT SUBSTR(FIPS, 1, 2) GEOID, \
		SUM(CAST(VOTE_REP as INTEGER)) r04, \
		SUM(CAST(VOTE_DEM as INTEGER)) d04, \
		SUM(CAST(TOTAL_VOTE as INTEGER)) tot04 \
		FROM \"2004\" WHERE SUBSTR(FIPS, 1, 2) IN ('02', '15') GROUP BY SUBSTR(FIPS, 1, 2)"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2004\" SET GEOID = '46102' WHERE GEOID = '46113'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2004\" SET \
		r04 = (SELECT SUM(r04) FROM \"2004\" WHERE GEOID IN ('51515', '51019')), \
		d04 = (SELECT SUM(d04) FROM \"2004\" WHERE GEOID IN ('51515', '51019')), \
		tot04 = (SELECT SUM(tot04) FROM \"2004\" WHERE GEOID IN ('51515', '51019')) \
		WHERE GEOID = '51019'"
	ogrinfo $(@D) -sql 'CREATE INDEX ON "2004" USING GEOID'

dbf/2000.dbf: results/2000.csv | dbf
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $< -dialect sqlite -sql "SELECT FIPS GEOID, CAST(BUSH as INTEGER) r00, CAST(GORE as INTEGER) d00, CAST(TOTAL_VOTE as INTEGER) tot00 \
		FROM \"2000\" WHERE STATE_NAME NOT IN ('Alaska', 'Hawaii')"
	ogr2ogr $@ $< -append -update -dialect sqlite \
		-sql "SELECT CASE STATE_NAME WHEN 'Hawaii' THEN '15' ELSE '02' END GEOID, \
		SUM(CAST(BUSH as INTEGER)) r00, \
		SUM(CAST(GORE as INTEGER)) d00, \
		SUM(CAST(TOTAL_VOTE as INTEGER)) tot00 \
		FROM \"2000\" WHERE STATE_NAME IN ('Alaska', 'Hawaii') GROUP BY STATE_NAME"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2000\" SET GEOID = '46102' WHERE GEOID = '46113'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2000\" SET GEOID = '12086' WHERE GEOID = '12025'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE \"2000\" SET \
		r00 = (SELECT SUM(r00) FROM \"2000\" WHERE GEOID IN ('51560', '51005')), \
		d00 = (SELECT SUM(d00) FROM \"2000\" WHERE GEOID IN ('51560', '51005')), \
		tot00 = (SELECT SUM(tot00) FROM \"2000\" WHERE GEOID IN ('51560', '51005')) \
		WHERE GEOID = '51005'"
	ogrinfo $(@D) -sql 'CREATE INDEX ON "2000" USING GEOID'

geo/counties.shp: $(DIR)/COUNTY/cb_2014_us_county_500k.shp $(DIR)/STATE/cb_2014_us_state_500k.shp | geo
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $< -t_srs EPSG:4326 -select GEOID,NAME -where "GEOID NOT LIKE '02%' \
		AND GEOID NOT LIKE '15%' \
		AND GEOID NOT LIKE '72%' \
		AND GEOID NOT LIKE '78%' \
		AND GEOID NOT LIKE '60%'"
	ogr2ogr $@ $(word 2,$^) -update -append -t_srs EPSG:4326 -select GEOID,NAME -where "GEOID IN ('02', '15')"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE "$(basename $(@F))" SET GEOID='46102' WHERE GEOID='46113'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE "$(basename $(@F))" SET NAME='DC' WHERE NAME='District of Columbia'"
	ogrinfo $(@D) -sql 'CREATE INDEX ON $(basename $(@F)) USING GEOID'

dbf/DEC_10.dbf dbf/DEC_00.dbf: dbf/%.dbf: census/%.csv | dbf
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $<
	ogrinfo $(@D) -sql 'CREATE INDEX ON $(basename $(@F)) USING GEOID'

dbf/DEC_90.dbf: census/DEC_90.csv
	@rm -f $(basename $@).{idm,ind}
	ogr2ogr $@ $<
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE $(basename $(@F)) SET \
		P01 = (SELECT SUM(CAST(P01 as INTEGER)) FROM $(basename $(@F)) WHERE GEOID IN ('51560', '51005')) \
		WHERE GEOID = '51005'"
	ogrinfo $(@D) -dialect sqlite -sql "UPDATE $(basename $(@F)) SET \
		P01 = (SELECT SUM(CAST(P01 as INTEGER)) FROM $(basename $(@F)) WHERE GEOID IN ('51515', '51019')) \
		WHERE GEOID = '51019'"
	ogrinfo $(@D) -sql 'CREATE INDEX ON $(basename $(@F)) USING GEOID'

census/DEC_90.csv: census/99C8_00.txt
	echo GEOID,P01,NAME > $@
	cut -c 4-10,130-176 $^ | \
	sed -E 's/,//g; s/([0-9]+) +/\1,/g' | \
	grep -vE '^(01|0[3-9]|1[0-46-9]|[2-9][0-9]),' | \
	grep -vE -e '^15[0-9][0-9][0-9],' -e '^02[0-9][0-9][0-9],' | \
	sed 's/^46113/46102/' \
	>> $@

data geo dbf:; mkdir -p $@
